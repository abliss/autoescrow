var Fs = require('fs');
var Http = require('http');
var Sys = require('sys');
var Url = require('url');
var MyCrypto = require('./my_crypto.js');

var evaluatorHash = MyCrypto.hash(Fs.readFileSync('games/rps.js'));

console.log('evaluator: ' + evaluatorHash);
Fs.writeFileSync("sha512/" + evaluatorHash, Fs.readFileSync('games/rps.js'));

var requestOpts = {
    host: "localhost",
    port: "8888",
};

var keys = [
    {pub: Fs.readFileSync('p1-pub.bin').toString('hex'),
     priv:Fs.readFileSync('p1-priv.bin')},
    {pub: Fs.readFileSync('p2-pub.bin').toString('hex'),
     priv:Fs.readFileSync('p2-priv.bin')}];
    
var gameHeader = {
    evaluator: evaluatorHash,
    players: [{key:keys[0].pub},
              {key:keys[1].pub}],
    rake: 1,
};

var warrant;
var gameId = MyCrypto.hash(JSON.stringify(gameHeader));

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
            console.log("warrant: " + MyCrypto.hash(body));
            warrant = JSON.parse(body);
            console.log("warrant address: " + warrant.address);
            cont(warrant);
        });
    });
    req.write(JSON.stringify(gameHeader));
    req.end();
}

function redeem(warrant) {
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




function verify(v, sgs) {
    console.log("Turns: " + sgs.gameState.turns.length);
    console.log("  result: " + JSON.stringify(v(MyCrypto, sgs)));
}
function testVerifier(v, spud0, spud1) {
    var gameState = {gameHeader: gameHeader, turns: []};
    var sgs = {gameState: gameState, signatures: []};
    function signBlank(playerNum) {
        var doc = MyCrypto.serialize(sgs.gameState.gameHeader);
        sgs.signatures[playerNum] = MyCrypto.hexSig(doc, keys[playerNum].priv);
    }
    signBlank(0);
    signBlank(1);
    verify(v, sgs);
    function makeTurn(playerNum, turnObj) {
        turnObj.who = playerNum;
        gameState.turns.push(turnObj);
        var doc = MyCrypto.serialize(sgs.gameState.gameHeader) +
            sgs.gameState.turns.map(MyCrypto.serialize).join('');
        sgs.signatures[playerNum] = MyCrypto.hexSig(doc, keys[playerNum].priv);
    }
    var salt0 = {spud:spud0, random:MyCrypto.random_bytes(32)};
    var hash0 = MyCrypto.hash(MyCrypto.serialize(salt0));
    makeTurn(0, {hash:hash0});
    verify(v, sgs);
    var salt1 = {spud:spud1, random:MyCrypto.random_bytes(32)};
    var hash1 = MyCrypto.hash(MyCrypto.serialize(salt1));
    makeTurn(1, {hash:hash1});
    verify(v, sgs);
    makeTurn(0, {salt:salt0});
    verify(v, sgs);
    makeTurn(1, {salt:salt1});
    verify(v, sgs);
}

//getWarrant(testWarrant);
var verifier = require('./games/rps.js').verifier;
testVerifier(verifier, 0, 2);
