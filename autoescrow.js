var Fs = require('fs');
var Http = require('http');
var Sys = require('sys');
var Url = require('url');

var privKey = Fs.readFileSync('server-priv.pem');

function sha1sum(blob) {
    var hash = require('crypto').createHash('sha1');
    hash.update(blob);
    var hex = hash.digest('hex');
    return hex;
}
function save(blob) {
    var sha1 = sha1sum(blob);
    Fs.writeFileSync('sha1/' + sha1, blob);
    return sha1;
}
function sign(obj) {
    var blob = JSON.stringify(obj);
    blob = blob.replace(/}\s*/,'');
    var sign = require('crypto').createSign("RSA-SHA256");
    sign.update(blob);
    var signature = sign.sign(privKey, 'base64');
    blob += '\n,"camliSig":"' + signature + '"}\n';
    return blob;
}

function checkEvaluator(sha1) {
    // TODO: check whitelist
    var evaluator = Fs.readFileSync('sha1/' + sha1);
    return true;
}

function postRequestHandler(request, response) {
    if (request.method !== 'POST') return;
    var path = Url.parse(request.url).path;
    console.log("POST " + path);
    if (path == '/new') {
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
                console.log(body);
                var reqObj = JSON.parse(body);
                // Check for minimum rake
                if (!(reqObj.rake > .0000001)) {
                    response.writeHead(403, "Escrow Declined");
                    response.write("Rake must exceed .0000001\r\n\r\n");
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
                var signedWarrant = sign(warrant);
                save(signedWarrant);
                response.writeHead(200, {"Content-Type":"application/json"});
                response.write(signedWarrant);
                response.end();
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
        if (path.match(/^\/sha1\/[0-9a-f]{32}./)) {
            path = path.substring(1);
        } else if (path === '/pubKey') {
            path = "server-cert.pem";
        } else {
            response.writeHead(404, "Not Found");
            response.write("Not found.\r\n\r\n");
            response.end();
            return;
        }
        var stream = Fs.createReadStream(path);
        stream.on("error", function(e) {
                      response.writeHead(404, "Not Found");
                      response.write("Not found.\r\n\r\n");
                      response.end();
                  });
        stream.setEncoding("ascii");
        response.writeHead(200, {"Content-Type":"text/plain"});
        stream.pipe(response);
        return;
    } catch (e) {
        console.log(e.stack);
        response.writeHead(500, "Error");
        response.write(e.stack);
        response.end();
    }
}

function getShaSync(sha1) {
    return Fs.readFileSync("sha1/" + sha1).toString();
}

var server = Http.createServer();
server.listen(8888);
server.addListener('request', postRequestHandler);
server.addListener('request', getRequestHandler);
Sys.puts("Listening on port 8888.");
