var Fs = require('fs');
var Http = require('http');
var Sys = require('sys');
var Url = require('url');

var sha1 = Fs.readlinkSync('games/hashed').substring(8);

var requestOpts = {
    host: "localhost",
    port: "8888",
};

var gameObj = {
    evaluator: sha1,
    players: [{key:Fs.readFileSync('p1-cert.pem').toString()},
              {key:Fs.readFileSync('p2-cert.pem').toString()}],
    rake: 0.001,
};

requestOpts.method = 'POST';
requestOpts.path = '/new';
console.log("Requesting " + JSON.stringify(requestOpts));
var warrant;
var req = Http.request(requestOpts, function(res) {
    console.log("Got response: " + res.statusCode);
    var body = '';
    res.on('data', function(chunk) {
        body += chunk;
    });
    res.on('end', function() {
        console.log(body);
        warrant = JSON.parse(body);
        console.log("warrant address: " + warrant.address);
    });
});

req.write(JSON.stringify(gameObj));
req.end();