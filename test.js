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
    port: "8888"
};

var keys = [
    {pub: Fs.readFileSync('p1-pub.bin').toString('hex'),
     priv:Fs.readFileSync('p1-priv.bin')},
    {pub: Fs.readFileSync('p2-pub.bin').toString('hex'),
     priv:Fs.readFileSync('p2-priv.bin')}];

var gameHeader = {
    evaluator: evaluatorHash,
    players: [{key:keys[0].pub,
               address: '15d7dDC7AuGiNfso8nsd2mscrmejdBEzDp'},
              {key:keys[1].pub,
               address: '1LkLVSJNj9b85LBsAiYnfTP3TZYLfMmz22'}],
    rake: 50000, // BTC .001
    nonce: Math.random()
};

var signedWarrant;
var gameId = MyCrypto.hash(JSON.stringify(gameHeader));

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
            if (res.statusCode != 200) {
                process.exit(res.statusCode);
            }
            console.log("signedWarrant: " + MyCrypto.hash(body));
            signedWarrant = JSON.parse(body);
            console.log("warrant address: " + signedWarrant.warrant.address);
            cont(signedWarrant);

        });
    });
    req.write(MyCrypto.serialize(gameHeader, "gameHeader"));
    req.end();
}

function redeem(signedGameState, signedWarrant) {
    requestOpts.method = 'POST';
    requestOpts.path = '/redeem';
    console.log("Requesting " + JSON.stringify(requestOpts));
    var req = Http.request(requestOpts, function(res) {
        console.log("Got response: " + res.statusCode);
        res.on('data', function(chunk) {
            console.log(chunk.toString());
        });
        res.on('end', function() {
        });
    });
    var redemption = {signedWarrant: signedWarrant, signedGameState: signedGameState};
    req.write(JSON.stringify(redemption));
    req.end();

}



function verify(v, sgs) {
    console.log("Turns: " + sgs.gameState.turns.length);
    console.log("  result: " + JSON.stringify(v(MyCrypto, sgs)));
}
function testEvaluator(v, choice0, choice1) {
    var gameState = {gameHeader: gameHeader, turns: []};
    var sgs = {gameState: gameState, signatures: []};
    function signBlank(playerNum) {
        var doc = MyCrypto.serialize(sgs.gameState.gameHeader);
        sgs.signatures[playerNum] = MyCrypto.hexSig(doc, keys[playerNum].priv);
    }
    signBlank(0);
    signBlank(1);
    if (v) verify(v, sgs);
    function makeTurn(playerNum, turnObj) {
        turnObj.who = playerNum;
        gameState.turns.push(turnObj);
        var doc = MyCrypto.serialize(sgs.gameState.gameHeader) +
            sgs.gameState.turns.map(MyCrypto.serialize).join('');
        sgs.signatures[playerNum] = MyCrypto.hexSig(doc, keys[playerNum].priv);
    }
    var salt0 = {choice:choice0, random:MyCrypto.randomHex(32)};
    var hash0 = MyCrypto.hash(MyCrypto.serialize(salt0));
    makeTurn(0, {hash:hash0});
    if (v) {verify(v, sgs);}
    var salt1 = {choice:choice1, random:MyCrypto.randomHex(32)};
    var hash1 = MyCrypto.hash(MyCrypto.serialize(salt1));
    makeTurn(1, {hash:hash1});
    if (v) verify(v, sgs);
    makeTurn(0, {salt:salt0});
    if (v) verify(v, sgs);
    makeTurn(1, {salt:salt1});
    if (v) verify(v, sgs);
    return sgs;
}

var evaluator;
//evaluator = require('./games/rps.js').evaluator;
var sgs = testEvaluator(evaluator, 0, 2);
console.log("==== gameState:\n" + JSON.stringify(sgs));
getWarrant(function(signedWarrant) {redeem(sgs, signedWarrant);});
