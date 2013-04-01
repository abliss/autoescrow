var Fs = require('fs');
var Http = require('http');
var Sys = require('sys');
var Url = require('url');
var Nacl = require('./nacl.js');


function hash(string) {
    return Nacl.to_hex(Nacl.crypto_hash_string(string));
}

var evaluatorHash = hash(Fs.readFileSync('games/rps.js'));

console.log('evaluator: ' + evaluatorHash);
Fs.writeFileSync("sha512/" + evaluatorHash, Fs.readFileSync('games/rps.js'));

var requestOpts = {
    host: "localhost",
    port: "8888",
};

var gameObj = {
    evaluator: evaluatorHash,
    players: [{key:Fs.readFileSync('p1-pub.bin').toString('hex')},
              {key:Fs.readFileSync('p2-pub.bin').toString('hex')}],
    rake: 0.001,
};


function getWarrant(cont) {
    requestOpts.method = 'POST';
    requestOpts.path = '/new';
    console.log("Requesting " + JSON.stringify(requestOpts));
    var req = Http.request(requestOpts, function(res) {
        console.log("Got response: " + res.statusCode);
        if (res.statusCode != 200) {
            process.exit(res.statusCode);
        }
        var body = '';
        res.on('data', function(chunk) {
            body += chunk;
        });
        res.on('end', function() {
            console.log(body);
            console.log("warrant: " + hash(body));
            warrant = JSON.parse(body);
            console.log("warrant address: " + warrant.address);
            cont(warrant);
        });
    });
    req.write(JSON.stringify(gameObj));
    req.end();
}

function useWarrant(warrant) {
    requestOpts.method = 'POST';
    requestOpts.path = '/redeem';
    console.log("Requesting " + JSON.stringify(requestOpts));
    var req = Http.request(requestOpts, function(res) {
        console.log("Got response: " + res.statusCode);
        var body = '';
        res.on('data', function(chunk) {
            body += chunk;
        });
        res.on('end', function() {
            console.log(body);
        });
    });
    var redemption = {warrant: warrant};
    req.write(JSON.stringify(redemption));
    req.end();
    
} 


getWarrant(useWarrant);