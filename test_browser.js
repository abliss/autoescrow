var url = 'https://autoescrow.firebaseIO-demo.com/lobby0';
var myRootRef = new Firebase(url);
var myId = Math.random();
var myPrivKey = '';
var myPubKey = '';
var EVALUATOR_HASH = "07f6ad119602c0ad132b3a9085a22d933fdd32c315c88b1c4de15e22aae582ce9af0abd770e3c532e5cbd698cfbafde2ad60aed2ed4f9001ff2e193162b69680"; //rps.js


function log(m) {
    try{
        console.log(m);
        document.getElementById('output').appendChild(document.createElement("br"));
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

document.getElementById('genKey').onclick = function() {
    var kp = nacl.crypto_sign_keypair();
    document.getElementById('privKey').value = nacl.to_hex(kp.signSk);
    document.getElementById('pubKey').value = nacl.to_hex(kp.signPk);
    updateKeys();
}

document.getElementById('announce').onclick = function() {
    myRootRef.push({
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
    var a = document.createElement("a");
    a.id = Math.random();
    a.href = "#" + name;
    a.onclick = function() {
        try {
            callback(obj);
        } catch(e) {
            console.log(e);
            throw e;
        }
    };
    a.innerHTML = name;
    //console.log("Set onclick of " + a.id + " to " + a.onclick);
    document.getElementById('output').innerHTML += " ";
    document.getElementById('output').appendChild(a);
}
myRootRef.limit(5).on('child_added', function(snapshot) {
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
            obj.gameHeader.players.forEach(function(p){
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
        log("Error on item: " + e);
    }
});

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
            handleWarrant(gameHeader,resp);
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
        var warrant = JSON.parse(warrantBlob);
        myRootRef.push({
            type:'propose',
            pubKey:nacl.to_hex(myPubKey),
            date:Date(),
            id: myId,
            gameHeader: gameHeader,
            warrantBlob: warrantBlob
        });
    } catch (e) {
        log(e + "\n");
    }
}

function accept(msgObj) {
    log("TODO: accept\n");
}