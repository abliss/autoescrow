var url = 'https://autoescrow.firebaseIO-demo.com/lobby0';
var myRootRef = new Firebase(url);
var myId = Math.random();
var myPrivKey = '';
var myPubKey = '';
var servKeyHex = '';
var EVALUATOR_HASH = "07f6ad119602c0ad132b3a9085a22d933fdd32c315c88b1c4de15e22aae582ce9af0abd770e3c532e5cbd698cfbafde2ad60aed2ed4f9001ff2e193162b69680"; //rps.js
var oldKeys = [];

function log(m) {
    try{
        console.log(m);
        document.getElementById('output').appendChild(document.createElement("br"));
        if (m.stack) m = m.stack;
        if (typeof m !== 'string') m = JSON.stringify(m);
        document.getElementById('output').innerHTML += m;
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
    myRootRef.push(msg);
    var val = function(){
        return msg;
    };
    childAdded({val:val});
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
    document.getElementById('privKey').value = nacl.to_hex(kp.signSk);
    document.getElementById('pubKey').value = nacl.to_hex(kp.signPk);
    updateKeys();
    oldKeys.push({priv: myPrivKey, pub:myPubKey});
};
document.getElementById('genKey').onclick = genKey;

document.getElementById('announce').onclick = function() {
    push({
        type:'announce',
        pubKey:nacl.to_hex(myPubKey),
        date:Date(),
        id: myId
    });
};

function abbrev(hex) {
    return hex.toString().substring(0,6) + "...";
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
    document.getElementById('output').innerHTML += " ";
    document.getElementById('output').appendChild(aNode);
    document.getElementById('output').appendChild(document.createTextNode(" "));

}
function childAdded(snapshot) {
    try {
        var obj = snapshot.val();
        if (obj.type == 'announce') {
            var message = "" + obj.date + " -- Player announced: " + 
                abbrev(obj.pubKey) + "&nbsp;&nbsp;";
            log(message);
            addAction("propose", propose, obj);
        } else if (obj.type == 'propose') {
            var me = false;
            var message = "" + obj.date + " -- Player " + 
                abbrev(obj.pubKey) + " proposed to: ";
            var labels = [];
            obj.signedGameState.gameState.gameHeader.players.forEach(
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
            if (me) {
                addAction("accept", accept, obj);
            } else {
                log("");
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
    }
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

function handleWarrant(gameHeader, warrantBlob) {
    try {
        var gameState = {gameHeader: gameHeader, turns: []};
        var sgs = {gameState:gameState, signatures:[]};
        sgs.signatures[0] = MyCrypto.hexSig(
            MyCrypto.serialize(gameHeader, 'GameHeader'), myPrivKey);
        var warrant = verifyBlob(warrantBlob, servKeyHex);
        var warrantId = MyCrypto.hash(warrantBlob);
        log("got valid warrant: " + abbrev(warrantId));
        push({
            type:'propose',
            pubKey:nacl.to_hex(myPubKey),
            date:Date(),
            id: myId,
            signedGameState: sgs,
            warrant: warrant
        });
    } catch (e) {
        log(e);
    }
}

//TODO: XX share with autoescrow.js
function verifyBlob(blob, pubKeyHex) {
    var sigHex = JSON.parse(blob).naclSig;
    blob = blob.replace(/\s*,"naclSig":"[0-9a-f]+"}\s*$/,'');
    var verified = MyCrypto.verify(blob, sigHex, pubKeyHex);
    if (!verified) {
        return null;
    }
    var obj = JSON.parse(blob + "}");
    return obj;
}

function accept(msgObj) {
    var gameHeader = obj.signedGameState.gameState.gameHeader;
    var gameId = MyCrypto.serialize(gameHeader, 'GameHeader');
    var warrant = msgObj.warrant;
    log("checking warrant...");
    warrant = verifyObj(MyCrypto.serialize(warrant, 'Warrant'), servKeyHex);
    throw "PICKUP";
    msgObj.signedGameState.signatures[1] = MyCrypto.hexSig(
        gameHeader, myPrivKey);
    push({
        type:'accept',
        pubKey:nacl.to_hex(myPubKey),
        date:Date(),
        id: myId,
        signedGameState: msgObj.signedGameState,
    });
}

window.setTimeout(fetchKey, 1);
window.setTimeout(genKey, 1);