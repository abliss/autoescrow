var url = 'https://autoescrow.firebaseIO-demo.com/lobby0';
var myRootRef = new Firebase(url);
var myId = Math.random();
var myPrivKey = '';
var myPubKey = '';
var EVALUATOR_HASH = "07f6ad119602c0ad132b3a9085a22d933fdd32c315c88b1c4de15e22aae582ce9af0abd770e3c532e5cbd698cfbafde2ad60aed2ed4f9001ff2e193162b69680"; //rps.js
var escrowServer = 'http://localhost:8888';

function hex2latin1(hex) {
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

function keysOk() {
    return (myPrivKey.length == 64) && (myPubKey.length == 32);
}
function updateKeys() {
    try {
        myPrivKey = nacl.encode_latin1(hex2latin1(document.getElementById('privKey').value));
        myPubKey = nacl.encode_latin1(hex2latin1(document.getElementById('pubKey').value));
        var ok = keysOk();
        document.getElementById('announce').disabled = !ok;
        document.getElementById('announceLabel').style.display = ok ? "none" :"inline"  ;
    } catch (e) {
        document.getElementById('output').innerHTML += e;
    }
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
myRootRef.limit(10).on('child_added', function(snapshot) {
    var obj = snapshot.val();
    if (obj.type == 'announce') {
        document.getElementById('output').innerHTML +=
        "\n" + obj.date + " -- Player announced: " + 
            abbrev(obj.pubKey) + "&nbsp;&nbsp;";
        var a = document.createElement("a");
        a.href = "#play=" + obj.pubKey;
        a.onclick = function() {
            propose(obj.pubKey);
        }
        a.innerHTML = "play";
        document.getElementById('output').appendChild(a);
        document.getElementById('output').innerHtml += "\n";
    }
});

function newXHR() {
    if (window.XMLHttpRequest) {
        return new XMLHttpRequest;
    }
    return new ActiveXObject("MSXML2.XMLHTTP.3.0");
}
function propose(eirKeyHex) {
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
            console.log("XXXX " + resp);
        } else {
            console.log("crS: " + client.readyState);
        }};
    client.open("POST", escrowServer + "/new");
    client.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    var message = MyCrypto.serialize(gameHeader, "gameHeader");
    client.send(message);
    console.log("sent request to " + escrowServer);
}
