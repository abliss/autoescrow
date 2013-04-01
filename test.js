var Fs = require('fs');
var Http = require('http');
var Sys = require('sys');
var Url = require('url');

function sha1sum(blob) {
    var hash = require('crypto').createHash('sha1');
    hash.update(blob);
    var hex = hash.digest('hex');
    return hex;
}

var evaluatorHash = sha1sum(Fs.readFileSync('games/rps.js'));

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
        var body = '';
        res.on('data', function(chunk) {
            body += chunk;
        });
        res.on('end', function() {
            console.log(body);
            console.log("warrant: " + sha1sum(body));
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