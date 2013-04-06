var Fs = require('fs');
var Http = require('http');
var Sys = require('sys');
var Url = require('url');
var MyCrypto = require('./my_crypto.js');

// the servers keys, which will either be generated or read from disk on startup
var privKey;
var pubKey;

// whitelist of evaluators we are willing to execute
var whitelist = {};
whitelist["07f6ad119602c0ad132b3a9085a22d933fdd32c315c88b1c4de15e22aae582ce9af0abd770e3c532e5cbd698cfbafde2ad60aed2ed4f9001ff2e193162b69680"] = "2p rock paper scissors v0.1";

if (process.argv.length > 2) {
    if (process.argv[2] === "genkey") {
        console.log("Generating new keypair.");
        var kp = require('./nacl.js').crypto_sign_keypair();
        Fs.writeFile("server-priv.bin", new Buffer(kp.signSk));
        Fs.writeFile("server-pub.bin", new Buffer(kp.signPk));
        privKey = kp.signSk;
        pubKey = kp.signPk;
    }
} else {
    try {
        privKey = Fs.readFileSync('server-priv.bin');
        pubKey = Fs.readFileSync('server-pub.bin');
    } catch (e) {
        console.log("Could not load keys! Try running 'node autoescrow.js genkey' first.");
        throw e;
    }
}
console.log("pubkey: " + new Buffer(pubKey).toString('hex'));


function save(blob) {
    var blobHash = MyCrypto.hash(blob);
    Fs.writeFile('sha512/' + blobHash, blob);
    return blobHash;
}
function signObj(obj, schema) {
    var blob = MyCrypto.serialize(obj, schema);
    var signature = MyCrypto.hexSig(blob, privKey);
    var signed = {};
    signed[schema] = obj;
    signed.signature = signature;
    return MyCrypto.serialize(signed, "signed_" + schema);
}
function verifyBlob(blob, schema) {
    var obj = JSON.parse(blob);
    var sigHex = obj.signature;
    if (!sigHex) {
        throw new Error("no signature in " + JSON.stringify(obj));
    }
    var signedMessage = MyCrypto.serialize(obj[schema], schema);
    if (!signedMessage) {
        throw new Error("no " + schema + " in " + JSON.stringify(obj));
    }
    var verified = MyCrypto.verify(signedMessage, sigHex, pubKey.toString('hex'));
    if (!verified) {
        return null;
    }
    return JSON.parse(verified);
}

function getEvaluator(blobHash) {
    //if (!whitelist[blobHash]) return null;
    return require('./sha512/' + blobHash).evaluator;
}

var postHandlers = {};
postHandlers["/new"] = function(response, body, headers) {
    headers["Content-Type"] ="text/plain";
    var reqObj = JSON.parse(body);
    // Check for minimum rake
    if (!(reqObj.rake > 0)) {
        response.writeHead(403, headers);
        var msg = "Declined. Rake must exceed 0\r\n\r\n";
        console.log(msg);
        response.write("Declined. Rake must exceed 0\r\n\r\n");
        response.end();
        return;
    }
    // Check for an acceptable evaluator
    if (!getEvaluator(reqObj.evaluator)) {
        response.writeHead(403, headers);
        var msg = "Declined. Evaluator " + reqObj.evaluator +
            "unnaceptable.\r\n\r\n";
        console.log(msg);
        response.write(msg);
        response.end();
        return;
    }
    // Save request for later reference
    var gameId = save(MyCrypto.serialize(reqObj, "GameHeader"));
    // make warrant
    var warrant = {
        address: "TODO:" + Math.random(),
        gameId: gameId
    };
    var signedWarrant = signObj(warrant, "warrant");
    var warrantId = save(signedWarrant);
    console.log("Issued warrant for sha512/" + gameId.substring(0,6)
                + " in sha512/" + warrantId.substring(0,6));
    headers["Content-Type"] ="application/json";
    response.writeHead(200, headers);
    response.write(signedWarrant);
    response.end();
};
postHandlers["/redeem"] = function(response, body, headers) {
    headers["Content-Type"] ="text/plain";
    var reqObj = JSON.parse(body);
    save(body);
    if (!reqObj.signedWarrant || !reqObj.signedGameState) {
        response.writeHead(400, headers);
        response.write("Need a signedWarrant and a signedGameState to redeem.");
        response.end();
        return;
    }
    // Exctract and verify the warrant
    // TODO: for now we are relying on the server's canonicalizing json format.
    if (!verifyBlob(MyCrypto.serialize(reqObj.signedWarrant, "signed_warrant"),
                    "warrant")) {
        response.writeHead(400, headers);
        response.write("That warrant does not verify!");
        response.end();
        return;
    }
    if (MyCrypto.hash(
            MyCrypto.serialize(
                reqObj.signedGameState.gameState.gameHeader, "gameHeader")) !==
        reqObj.signedWarrant.warrant.gameId) {
        response.writeHead(400, headers);
        response.end();
        return;
    }
    var evaluator = getEvaluator(
        reqObj.signedGameState.gameState.gameHeader.evaluator);
    var state;
    try {
        state = evaluator(MyCrypto, reqObj.signedGameState);
    } catch (e) {
        response.writeHead(400, headers);
        response.write("Evaluator error:");
        response.write(e.message + "\n");
        response.write(e.stack);
        response.end();
        return;
    }
    if (!state.payout) {
        response.writeHead(400, headers);
        response.write("Nonterminal gamestate:");
        response.write(JSON.stringify(state));
    }
    response.writeHead(200, headers);
    response.write("Looks good: TODO, payout: " + state.payout);
    response.end();
};

function postRequestHandler(request, response) {
    if (request.method !== 'POST') return;
    var headers = {};
    headers["Access-Control-Allow-Origin"] = "*";
    //headers["Access-Control-Allow-Origin"] = req.headers.origin;
    headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    headers["Access-Control-Allow-Credentials"] = false;
    headers["Access-Control-Max-Age"] = '86400'; // 24 hours
    headers["Access-Control-Allow-Headers"] = "X-Requested-With,X-HTTP-Method-Override,Content-Type,Accept";

    var path = Url.parse(request.url).path;
    console.log("POST " + path);
    var handler = postHandlers[path];
    if (handler) {
        var body = '';
        request.on('data', function(chunk) {
                       body += chunk;
                       if (body.length > 1e6) {
                           queryData = "";
                           headers["Content-Type"] ="text/plain";
                           response.writeHead(413, headers);
                           request.connection.destroy();
                       }
                   });
        request.on('end', function() {
                       try {
                           handler(response, body, headers);
                       } catch (e) {
                           console.log(e.stack);
                           headers["Content-Type"] ="text/plain";
                           response.writeHead(500, headers);
                           response.write(e.stack);
                           response.write("\r\n\r\n");
                           response.end();
                       }
                   });
    } else {
        headers["Content-Type"] ="text/plain";
        response.writeHead(404, headers);
        response.end();
    }
}

function getRequestHandler(request, response) {
    if (request.method !== 'GET') return;
    var headers = {};
    headers["Access-Control-Allow-Origin"] = "*";
    //headers["Access-Control-Allow-Origin"] = req.headers.origin;
    headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    headers["Access-Control-Allow-Credentials"] = false;
    headers["Access-Control-Max-Age"] = '86400'; // 24 hours
    headers["Access-Control-Allow-Headers"] = "X-Requested-With,X-HTTP-Method-Override,Content-Type,Accept";
            headers["Content-Type"] ="text/plain";
    var path = Url.parse(request.url).path;
    console.log("GET " + path);
    try {
        if (path.match(/^\/sha5121\/[0-9a-f]{32}./)) {
            headers["Content-Type"] ="application/octet-stream";
            response.writeHead(200, headers);
            var stream = Fs.createReadStream(path);
            stream.on("error", function(e) {
                          response.writeHead(404, "Not Found");
                          response.write("Not found.\r\n\r\n");
                          response.end();
                      });
            stream.setEncoding("ascii");
            stream.pipe(response);
            return;
        } else if (path === '/pubKey') {
            headers["Content-Type"] ="text/plain";
            response.writeHead(200, headers);
            response.write(pubKey.toString('hex'));
            response.end();
            return;
        } else {
            headers["Content-Type"] ="text/plain";
            response.writeHead(404, headers);
            response.write("Not found.\r\n\r\n");
            response.end();
            return;
        }
        return;
    } catch (e) {
        console.log(e.stack);
        headers["Content-Type"] ="text/plain";
        response.writeHead(500, headers);
        response.write(e.stack);
        response.end();
    }
}

// for allowing cross-origin requests
function optionsRequestHandler(req, res) {
    if (req.method === 'OPTIONS') {
        console.log('!OPTIONS');
        var headers = {};
        // IE8 does not allow domains to be specified, just the *
        headers["Access-Control-Allow-Origin"] = "*";
        //headers["Access-Control-Allow-Origin"] = req.headers.origin;
        headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
        headers["Access-Control-Allow-Credentials"] = false;
        headers["Access-Control-Max-Age"] = '86400'; // 24 hours
        headers["Access-Control-Allow-Headers"] = "X-Requested-With,X-HTTP-Method-Override,Content-Type,Accept";
        headers["Content-type"] = "text/html";
        res.writeHead(200, headers);
        res.end();
    }
}

function getByHashSync(blobHash) {
    return Fs.readFileSync("sha512/" + blobHash).toString();
}

var server = Http.createServer();
server.listen(8888);
server.addListener('request', postRequestHandler);
server.addListener('request', getRequestHandler);
server.addListener('request', optionsRequestHandler);
Sys.puts("Listening on port 8888.");
