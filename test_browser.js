var url = 'https://autoescrow.firebaseIO-demo.com/lobby0';
var myRootRef = new Firebase(url);
var myId = Math.random();
var myPrivKey = '';
var myPubKey = '';
var servKeyHex = '';
var EVALUATOR_HASH = "5f3e4c4c854dbdac79eb5fd4812b279b700be77059f321174259dc34a783b209b43120c4d4c76137cca36b21cecc23cec30e9d0910eb0130b35d29a361bc5d39"; //rps.js

// allows user to take on multiple personas
var secrets = {};

function log(m) {
    try{
        console.log(m);
        document.getElementById('output').appendChild(document.createElement("br"));
        if (m.stack) m = m.stack;
        if (typeof m !== 'string') m = JSON.stringify(m);
        document.getElementById('output').appendChild(document.createTextNode(m));
    } catch(e) {
        console.log(e);
    }
}
function hex2latin1(hex) {
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

function push(msg) {
    msg.pubKey = nacl.to_hex(myPubKey);
    msg.date = Date(),
    msg.id =  myId,
    msg.version = 1;

    var val = function(){
        return msg;
    };
    myRootRef.push(msg);
    //XX for when firebase is buggy:
    //childAdded({val:val});
}
function keysOk() {
    return (myPrivKey.length == 64) && (myPubKey.length == 32);
}
function escrowServer() {
    return document.getElementById('server').value;
}
function updateKeys() {
    var ok = false;
    try {
        myPrivKey = nacl.encode_latin1(hex2latin1(document.getElementById('privKey').value));
        myPubKey = nacl.encode_latin1(hex2latin1(document.getElementById('pubKey').value));
        servKeyHex = document.getElementById('servKey').value;
        ok = keysOk();
        document.getElementById('announce').disabled = !ok;
        document.getElementById('announceLabel').style.display = ok ? "none" :"inline"  ;
    } catch (e) {
        log(e);
    }
    document.getElementById('announce').disabled = !ok;
    document.getElementById('announceLabel').style.display = ok ? "none" :"inline"  ;
}
document.getElementById('privKey').onchange = updateKeys;
document.getElementById('pubKey').onchange = updateKeys;
document.getElementById('servKey').onchange = updateKeys;


function fetchKey() {
    var client = newXHR();
    client.onreadystatechange = function () {
        if (client.readyState == 4) {
            var resp = client.responseText;
            document.getElementById('servKey').value = resp;
            updateKeys();
        }
    };
    client.open("GET", escrowServer() + "/pubKey");
    client.send();
};
document.getElementById('getServKey').onclick = fetchKey;

function genKey() {
    var kp = nacl.crypto_sign_keypair();
    var privHex = nacl.to_hex(kp.signSk);
    var pubHex = nacl.to_hex(kp.signPk);
    function setKeys() {
        document.getElementById('privKey').value = privHex;
        document.getElementById('pubKey').value = pubHex;
        updateKeys();
    }

    var aNode = document.createElement("a");
    aNode.href = "#key=" + pubHex;
    aNode.onclick = setKeys;
    aNode.innerHTML = abbrev(pubHex);
    document.getElementById('oldKeys').appendChild(aNode);
    document.getElementById('oldKeys').appendChild(document.createTextNode(" "));

    setKeys();

    announce();
};
function announce() {
    push({
        type:'announce'
    });
};
document.getElementById('genKey').onclick = genKey;
document.getElementById('announce').onclick = announce;

function abbrev(hex) {
    if (hex === nacl.to_hex(myPubKey)) {
        return "ME";
    } else {
        return hex.toString().substring(0,6) + "\u2026";
    }
}
function addAction(name, callback, obj) {
    var aNode = document.createElement("a");
    aNode.id = Math.random();
    aNode.href = "#" + name;
    aNode.onclick = function() {
        try {
            callback(obj);
        } catch(e) {
            log(e);
        }
    };
    aNode.innerHTML = name;
    //console.log("Set onclick of " + aNode.id + " to " + aNode.onclick);
    document.getElementById('output').appendChild(document.createTextNode(" "));
    document.getElementById('output').appendChild(aNode);
    document.getElementById('output').appendChild(document.createTextNode(" "));

}
function checkMe(me) {
    return me;
    //return true;
}
function childAdded(snapshot) {
    try {
        var obj = snapshot.val();
        if (!(obj.version >= 1)) return;
        window.LAST_CHILD = obj;
        var message = "";
        var gameHeader;
        var gameId;
        if (obj.date) {
            message += obj.date + ": ";
        }
        if (obj.pubKey) {
            message += "Player " + abbrev(obj.pubKey) + ": ";
        }
        if (obj.signedGameState) {
            gameHeader = obj.signedGameState.gameState.gameHeader;
            gameId = MyCrypto.hash(MyCrypto.serialize(gameHeader, 'GameHeader'));
            if (!obj.signedGameState.gameState.turns) {
                obj.signedGameState.gameState.turns = []; // XXX firebase bug?!
            }
        }
        if (obj.type == 'announce') {
            message += " announced. ";
            log(message);
            addAction("propose", propose, obj);
        } else if (obj.type == 'propose') {
            var me = false;
            message += " proposed game " + abbrev(gameId);
            message += " amongst: ";
            var labels = [];
            gameHeader.players.forEach(
                function(p){
                    if (p.key === obj.pubKey) {
                        labels.push("self");
                    } else if (p.key === nacl.to_hex(myPubKey)) {
                        labels.push("ME");
                        me = true;
                    } else {
                        labels.push(abbrev(p.key));
                    }
                });
            log(message + labels.join(", "));
            if (checkMe(me)) {
                addAction("accept", accept, obj);
            }
        } else if (obj.type == 'turn') {
            message += " played in game " + abbrev(gameId);
            log(message);
            try {
                var result = window.evaluator(MyCrypto,obj.signedGameState);
                if (result.payout) {
                    addAction("redeem", redeem, obj);
                } else {
                    var me = (gameHeader.players[result.nextPlayer].key
                              == nacl.to_hex(myPubKey));
                    if (checkMe(me)) {
                        addAction("add to this game", play, obj);
                    }
                }
                log("   result: " + JSON.stringify(result));
                if (result.nextPlayer >= 0) {
                    log("   next to play is " + abbrev(gameHeader.players[result.nextPlayer].key));
                }
            } catch (e) {
                log(e);
                log(obj.signedGameState);
            }
        } else {
            log("Unknown message received: " + JSON.stringify(obj));
        }
    } catch (e) {
        log(e);
    }
}

myRootRef.limit(5).on('child_added', childAdded);
function newXHR() {
    if (window.XMLHttpRequest) {
        return new XMLHttpRequest;
    }
    return new ActiveXObject("MSXML2.XMLHTTP.3.0");
}
function propose(msgObj) {
    var eirKeyHex = msgObj.pubKey;
    if (!keysOk()) {
        alert("You must have keys before you can play! Press Generate.");
        return;
    }
    var gameHeader = {
        evaluator: EVALUATOR_HASH,
        players: [{key:nacl.to_hex(myPubKey)},
                  {key:eirKeyHex}],
        rake: 1,
        nonce: Math.random()
    };
    var client = newXHR();
    client.onreadystatechange = function () {
        if (client.readyState == 4) {
            var resp = client.responseText;
            handleWarrant(gameHeader, resp);
        }
    };
    client.open("POST", escrowServer() + "/new");
    client.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    var message = MyCrypto.serialize(gameHeader, "gameHeader");
    client.send(message);
    log("sent request to " + escrowServer());
}

function handleWarrant(gameHeader, signedWarrantBlob) {
    try {
        var gameState = {gameHeader: gameHeader, turns: []};
        var sgs = {gameState:gameState, signatures:[]};
        sgs.signatures[0] = MyCrypto.hexSig(
            MyCrypto.serialize(gameHeader, 'GameHeader'), myPrivKey);
        var signedWarrant = JSON.parse(signedWarrantBlob);
        var warrant = MyCrypto.verifySignedObj(signedWarrant, "warrant", servKeyHex);
        var warrantId  = MyCrypto.hash(MyCrypto.serialize(signedWarrant, "signed_Warrant"));
        if (warrant) {
            log("got valid warrant: " + abbrev(warrantId));
        } else {
            log("got invalid warrant: " + signedWarrantBlob);
            return;
        }
        push({
            type:'propose',
            signedGameState: sgs,
            signedWarrant: signedWarrant
        });
    } catch (e) {
        log(e);
    }
}

//TODO: XX share with autoescrow.js
function verifyBlob(blob, pubKeyHex) {
    var signedObj = JSON.parse(blob);
    var sigHex = signedObj.naclSig;
    if (!sigHex) return null;
    blob = blob.replace(/\s*,"naclSig":"[0-9a-f]+"}\s*$/,'');
    var verified = MyCrypto.verify(blob, sigHex, pubKeyHex);
    if (!verified) {
         return null;
    }
    var obj = JSON.parse(blob + "}");
    return signedObj;
}

function accept(msgObj) {
    var gameHeader = msgObj.signedGameState.gameState.gameHeader;
    var gameId = MyCrypto.hash(MyCrypto.serialize(gameHeader, 'GameHeader'));
    var warrant = MyCrypto.verifySignedObj(msgObj.signedWarrant, "warrant", servKeyHex);
    if (!warrant) {
        log("Bad warrant: " + JSON.stringify(msgObj.signedWarrant));
        return;
    }
    if ((warrant.gameId !== gameId)) {
        log("Wrong warrant " + JSON.stringify(warrant));
        log("inside " + JSON.stringify(msgObj.signedWarrant));
        log("Game was: " + MyCrypto.serialize(gameHeader, "GameHeader"));
        log("wanted gameId=" + gameId );
        return;
    }
    var warrantId  = MyCrypto.hash(MyCrypto.serialize(msgObj.signedWarrant, 'signed_warrant'));
    log("got valid warrant: " + abbrev(warrantId));
    msgObj.signedGameState.signatures[1] = MyCrypto.hexSig(
        MyCrypto.serialize(gameHeader,"GameHeader"), myPrivKey);
    push({
        type:'turn',
        signedGameState: msgObj.signedGameState,
        signedWarrant: msgObj.signedWarrant
    });
}

function makeTurn(msgObj, turnObj) {
    var sgs = msgObj.signedGameState;
    var playerNum = sgs.gameState.turns.length % 2;
    turnObj.who = playerNum;
    sgs.gameState.turns.push(turnObj);
    var doc = MyCrypto.serialize(sgs.gameState.gameHeader) +
        sgs.gameState.turns.map(MyCrypto.serialize).join('');
    sgs.signatures[playerNum] = MyCrypto.hexSig(doc, myPrivKey);
    push({
        type:'turn',
        signedGameState: sgs,
        signedWarrant: msgObj.signedWarrant
    });
}

function play(msgObj) {
    var gameHeader = msgObj.signedGameState.gameState.gameHeader;
    var gameId = MyCrypto.hash(MyCrypto.serialize(gameHeader, 'GameHeader'));
    var turns = msgObj.signedGameState.gameState.turns;

    if (turns.length < 2) {
        // first turn
        var choice = prompt("Enter 0 for rock, 1 for paper, 2 for scissors.");
        var salt = {choice:choice, random:MyCrypto.randomHex(32)};
        var hash = MyCrypto.hash(MyCrypto.serialize(salt, "Salt"));
        secrets[hash] = {salt:salt};
        makeTurn(msgObj, {hash:hash});
    } else {
        // second turn
        var lastHash = turns[turns.length - 2].hash;
        var oldSecret = secrets[lastHash];
        if (!oldSecret) {
            alert("Secret lost! that game is irretrievable.");
        } else {
            makeTurn(msgObj, {salt:oldSecret.salt});
        }
    }
}

function redeem(msgObj) {
    var redemption = {
        signedWarrant:msgObj.signedWarrant,
        signedGameState:msgObj.signedGameState
    };
    var client = newXHR();
    client.onreadystatechange = function () {
        if (client.readyState == 4) {
            var resp = client.responseText;
            log(resp);
        }
    };
    client.open("POST", escrowServer() + "/redeem");
    client.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    var message = MyCrypto.serialize(redemption, "Redemption");
    client.send(message);
    log("sent request to " + escrowServer());
}
window.setTimeout(fetchKey, 1);
window.setTimeout(genKey, 1);