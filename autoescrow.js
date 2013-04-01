var Fs = require('fs');
var Http = require('http');
var Sys = require('sys');
var Url = require('url');
var MyCrypto = require('./my_crypto.js');

// the servers keys, which will either be generated or read from disk on startup.
var privKey;
var pubKey;

if (process.argv.length > 2) {
    if (process.argv[2] === "genkey") {
        console.log("Generating new keypair.");
        var kp = require('./nacl.js').crypto_sign_keypair();
        Fs.writeFileSync("server-priv.bin", new Buffer(kp.signSk));
        Fs.writeFileSync("server-pub.bin", new Buffer(kp.signPk));
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
    Fs.writeFileSync('sha512/' + blobHash, blob);
    return blobHash;
}
function signObj(obj) {
    var blob = JSON.stringify(obj);
    blob = blob.replace(/}\s*/,'');
    var signature = MyCrypto.hexSig(blob, privKey);
    blob += '\n,"naclSig":"' + signature + '"}\n';
    return blob;
}
function verifyBlob(blob) {
    var sigHex = JSON.parse(blob).naclSig;
    blob = blob.replace(/\s*,"naclSig":"[0-9a-f]+"}\s*$/,'');
    var verified = MyCrypto.verify(blob, sigHex, pubKey);
    if (!verified) {
        return null;
    }
    var obj = JSON.parse(blob + "}");
    return obj;
}

function checkEvaluator(blobHash) {
    // TODO: check whitelist
    var evaluator = Fs.readFileSync('sha512/' + blobHash);
    return true;
}

var postHandlers = {};
postHandlers["/new"] = function(response, body) {
    var reqObj = JSON.parse(body);
    // Check for minimum rake
    if (!(reqObj.rake > 0)) {
        response.writeHead(403, "Escrow Declined");
        response.write("Rake must exceed 0\r\n\r\n");
        response.end();
        return;
    }
    // Check for an acceptable evaluator
    if (!checkEvaluator(reqObj.evaluator)) {
        response.writeHead(403, "Escrow Declined");
        response.write("Evaluator " + reqObj.evaluator + "unnaceptable.\r\n\r\n");
        response.end();
        return;
    }
    // Save request for later reference
    var gameId = save(body);
    // make warrant
    var warrant = {
        address: "TODO",
        gameId: gameId
    };
    var signedWarrant = signObj(warrant);
    save(signedWarrant);
    response.writeHead(200, {"Content-Type":"application/json"});
    response.write(signedWarrant);
    response.end();
};
postHandlers["/redeem"] = function(response, body) {
    var reqObj = JSON.parse(body);
    // Exctract and verify the warrant
    // TODO: for now we are relying on the server's canonicalizing json format.
    if (!verifyBlob(JSON.stringify(reqObj.warrant))) {
        response.writeHead(413, {"Content-Type":"text/plain"});
        response.write("That warrant does not verify!");
        response.end();
        return;
    }
    response.writeHead(200, {"Content-Type":"text/plain"});
    response.write("That warrant looks good.");
    response.end();
};

function postRequestHandler(request, response) {
    if (request.method !== 'POST') return;
    var path = Url.parse(request.url).path;
    console.log("POST " + path);
    var handler = postHandlers[path];
    if (handler) {
        // New warrant.
        var body = '';
        request.on('data', function(chunk) {
                       body += chunk;
                       if (body.length > 1e6) {
                           queryData = "";
                           response.writeHead(413, {'Content-Type': 'text/plain'});
                           request.connection.destroy();
                       }
                   });
        request.on('end', function() {
                       try {
                           handler(response, body);
                       } catch (e) {
                           console.log(e.stack);
                           response.writeHead(500, {"Content-Type":"text/plain"});
                           response.write(e.stack);
                           response.write("\r\n\r\n");
                           response.end();
                       }
                   });
    } else {
        response.writeHead(404, "Not Found");
        response.end();
    }
}

function getRequestHandler(request, response) {
    if (request.method !== 'GET') return;
    var path = Url.parse(request.url).path;
    console.log("GET " + path);
    try {
        if (path.match(/^\/sha5121\/[0-9a-f]{32}./)) {
            response.writeHead(200, {"Content-Type":"application/octet-stream"});
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
            response.writeHead(200, {"Content-Type":"application/octet-stream"});
            response.write(pubKey);
            response.end();
            return;
        } else {
            response.writeHead(404, "Not Found");
            response.write("Not found.\r\n\r\n");
            response.end();
            return;
        }
        return;
    } catch (e) {
        console.log(e.stack);
        response.writeHead(500, "Error");
        response.write(e.stack);
        response.end();
    }
}

function getByHashSync(blobHash) {
    return Fs.readFileSync("sha512/" + blobHash).toString();
}

var server = Http.createServer();
server.listen(8888);
server.addListener('request', postRequestHandler);
server.addListener('request', getRequestHandler);
Sys.puts("Listening on port 8888.");
