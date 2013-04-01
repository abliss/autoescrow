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

var keys = [
    {pub: Fs.readFileSync('p1-pub.bin').toString('hex'),
     priv:Fs.readFileSync('p1-priv.bin').toString('hex')},
    {pub: Fs.readFileSync('p2-pub.bin').toString('hex'),
     priv:Fs.readFileSync('p2-priv.bin').toString('hex')}];
    
var gameHeader = {
    evaluator: evaluatorHash,
    players: [{key:keys[0].pub},
              {key:keys[1].pub}],
    rake: 1,
};

var warrant;
var gameId = hash(JSON.stringify(gameHeader));

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
    req.write(JSON.stringify(gameHeader));
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

function updateSignature(sgs, playernum) {
    var doc = JSON.stringify(sgs.gameState.gameId) + 
        sgs.gameState.turns.map(JSON.stringify).join('');
    
}
getWarrant(useWarrant);

var gameState = {gameId: gameId, turns: []};
var signedGameState = {gameState: gameState, signatures: []};