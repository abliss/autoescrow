var Fs = require('fs');
var Http = require('http');
var Sys = require('sys');
var Url = require('url');
var MyCrypto = require('./my_crypto.js');
var Bitcoin = require('bitcoin');
var Crypto = require('crypto');

// the servers keys, which will either be generated or read from disk on startup
var privKey;
var pubKey;
// whitelist of evaluators we are willing to execute
var whitelist = {};
whitelist["07f6ad119602c0ad132b3a9085a22d933fdd32c315c88b1c4de15e22aae582ce9af0abd770e3c532e5cbd698cfbafde2ad60aed2ed4f9001ff2e193162b69680"] = "2p rock paper scissors v0.1";

// ==== Read or generate our keys
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

// ==== Connect to bitcoind
function connectBitcoin() {
    var clientOpts = {host:"rapidraven.com", port:8332, user:'autescrow', pass:'', timeout:1000};
    var conf;
    try {
        conf = Fs.readFileSync(process.env.HOME + '/.bitcoin/bitcoin.conf').toString();
    } catch (e) {
        // no bitcoin.conf
    }
    if (conf) {
        clientOpts.host = "localhost";
        var m;
        m = conf.match(/rpcuser=(.*)/);
        if (m) clientOpts.user = m[1];
        m = conf.match(/rpcpassword=(.*)/);
        if (m) clientOpts.pass = m[1];
        m = conf.match(/rpcport=(.*)/);
        if (m) clientOpts.port = m[1];
    }
    return new Bitcoin.Client(clientOpts);
}
// empty out the balance of this account into the 'rake' account.
function dropRake(account) {
    btClient.cmd('getbalance', account, 0, function(err, balance){
        if (err) {
            console.log("dropRake fail: " + JSON.stringify(err));
        } else {
            btClient.cmd('move', account, 'rake', balance, 0, function(err2, result) {
                if (err2) console.log(JSON.stringify(err2));
                if (result) console.log(JSON.stringify(result));
            });
        }
    });
}
var btClient = connectBitcoin();
btClient.cmd('getbalance', '*', 6, function(err, balance){
    if (err) console.log(err);
    console.log('Bitcoin 6-Balance:', balance);
});

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

function getEvaluator(blobHash) {
    //if (!whitelist[blobHash]) return null;
    return require('./sha512/' + blobHash).evaluator;
}

var postHandlers = {};
var minRake = 50000;// BTC .005, should cover transaction fees
postHandlers["/new"] = function(response, body, headers) {
    headers["Content-Type"] ="text/plain";
    var reqObj = JSON.parse(body);
    // Check for minimum rake
    if (!(reqObj.rake >= minRake)) {
        response.writeHead(403, headers);
        var msg = "Declined. Rake must be at least " + minRake + "\r\n\r\n";
        console.log(msg);
        response.write(msg);
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
    btClient.cmd('getaccountaddress',
                 'autoescrow-' + gameId,
                 function(err,address){
                     if (err) {
                         console.log(err);
                         response.writeHead(500, headers);
                         response.write(JSON.stringify(err));
                         response.end();
                     } else {
                         var warrant = {
                             address: address,
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
                     }
                 });

};
postHandlers["/redeem"] = function(response, body, headers) {
    headers["Content-Type"] ="text/plain";
    var reqObj = JSON.parse(body);
    var saved = save(body);
    if (!reqObj.signedWarrant || !reqObj.signedGameState) {
        response.writeHead(400, headers);
        response.write("Need a signedWarrant and a signedGameState to redeem.");
        response.end();
        return;
    }
    // Exctract and verify the warrant
    // TODO: for now we are relying on the server's canonicalizing json format.
    if (!MyCrypto.verifySignedObj(reqObj.signedWarrant, "warrant", pubKey)) {
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
    var account = "autoescrow-" + reqObj.signedWarrant.warrant.gameId;
    console.log("Paying out redemption " + saved);
    response.writeHead(200, headers);
    response.write("Looks good: processing payout: " + state.payout + " from " + account + "...\n");
    btClient.cmd('getbalance', account, 0, function(err, balance){
        if (err) {
            response.write("Error getting balance: " + JSON.stringify(err));
            response.end();
        } else {
            response.write("Total 0-balance: " + balance + "\n");
            // extract rake. the transaction fee will be paid out of this share.
            balance -= reqObj.signedGameState.gameState.gameHeader.rake / 10000000;
            response.write("After rake: " + balance + "\n");
            if (balance <= 0) {
                response.write("Insufficient balance in pot! Wait for more antes, then try redeeming again.");
                response.end();
            } else {
                var payments = {};
                var payoutSum = 0;
                var minconf = 0;
                state.payout.forEach(function(s) {payoutSum += s;});
                for (var i = 0; i < state.payout.length; i++) {
                    var amountToPay = balance * state.payout[i] / payoutSum;
                    var addrToPay = reqObj.signedGameState.gameState.gameHeader.players[i].address;
                    response.write("Paying " + amountToPay + " to " + addrToPay + "\n");
                    if (amountToPay != 0) {
                        payments[addrToPay] = amountToPay;
                    }
                }
                btClient.cmd('sendmany', account, payments, minconf, function(err, txid) {
                    if (err) {
                        response.write("Error paying: " + JSON.stringify(err) + "\n");
                    } else {
                        response.write("Paid. Transaction ID: " + txid + "\n");
                        dropRake(account);
                    }
                    response.end();
                });
            }
        }
    });

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
        if (path.match(/^\/sha512\/[0-9a-f]{128}$/)) {
            headers["Content-Type"] ="application/octet-stream";
            var stream = Fs.createReadStream("." + path);
            stream.on("error", function(e) {
                console.error(e);
                response.writeHead(404, "Not Found");
                response.write("hash " + path + " not found.\r\n\r\n");
                response.end();
            });
            response.writeHead(200, headers);
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

function putRequestHandler(req, response) {
    if (req.method !== 'PUT') { return; }
    var path = Url.parse(req.url).path;
    if (path != "/sha512") { return; }
    var filename = "tmp-autoescrow-" + Date.now() + "-" + Math.random() + ".tmp";
    var wstream = Fs.createWriteStream(filename);
    var hasher = Crypto.createHash('sha512');
    // TODO: limit max size, throughput.
    req.on('data', function(chunk) {
        hasher.update(chunk);
        wstream.write(chunk);
    });
    req.on('end', function() {
        wstream.close();
        var hexKey = hasher.digest('hex');
        Fs.rename(filename, 'sha512/' + hexKey, function(err) {
            if (err) {
                throw err;
            }
            var headers = {};
            headers["Content-type"] = "text/html";
            response.writeHead(200, headers);
            response.write(hexKey);
            response.end();
        });
    });
}


var server = Http.createServer();
server.listen(8888);
server.addListener('request', postRequestHandler);
server.addListener('request', getRequestHandler);
server.addListener('request', optionsRequestHandler);
server.addListener('request', putRequestHandler);
Sys.puts("Listening on port 8888.");
