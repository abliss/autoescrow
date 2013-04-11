if (typeof(window) !== 'undefined') {
    MyCrypto = {};
}
// Wrappers around Nacl. All take regular strings and return hex strings.
(function(global) {
    var Nacl = (typeof(nacl) === 'undefined') ? require("./nacl.js") : nacl;

    function hex2latin1(hex) {
        var str = '';
        for (var i = 0; i < hex.length; i += 2)
            str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        return str;
    }

    global.hash = function(string) {
        if (typeof string === 'string') {
            return Nacl.to_hex(Nacl.crypto_hash_string(string));
        } else {
            return Nacl.to_hex(Nacl.crypto_hash(string));
        }
    };
    global.hexSig = function(string, priv) {
        var signedMessage = Nacl.crypto_sign(Nacl.encode_utf8(string), priv);
        // Nacl puts 32 bytes of signature before the message and 32 bytes after.
        var signature = Nacl.to_hex(signedMessage.subarray(0,32)) +
            Nacl.to_hex(signedMessage.subarray(signedMessage.length - 32));
        return signature;
    };
    global.verify = function(string, hexSig, pubHex) {
        var sigl1 = hex2latin1(hexSig);
        var publ1 = hex2latin1(pubHex);
        // TODO: mixing latin1 and utf8 here?
        var signedMessage = Nacl.encode_latin1(sigl1.substring(0,32) +
                                               string + sigl1.substring(32));

        var verified = Nacl.crypto_sign_open(signedMessage,
                                             Nacl.encode_latin1(publ1));
        if (!verified) throw new Error("Signature didn't verify against pubKey " + pubHex);
        return Nacl.decode_utf8(verified);
    };
    global.randomHex = function(num) {
        return Nacl.to_hex(Nacl.random_bytes(num));
    }
    // TODO: should be a protobuffer maybe?
    global.serialize = function(obj) {
        var keys = [];
        for (var k in obj) if (obj.hasOwnProperty(k)) {
            keys.push(k);
        }
        var newObj = {};
        keys.sort().forEach(function(k) {
            newObj[k] = obj[k];
        });
        return JSON.stringify(newObj);
    }
    global.deserialize = function(blob) {
        return JSON.parse(blob);
    }
    
    global.verifySignedObj = function(obj, innerSchema, pubKey) {
        var sigHex = obj.signature;
        if (!sigHex) {
            throw new Error("no signature in " + JSON.stringify(obj));
        }
        var signedMessage = global.serialize(obj[innerSchema], innerSchema);
        if (!signedMessage) {
            throw new Error("no " + innerSchema + " in " + JSON.stringify(obj));
        }
        var verified = global.verify(signedMessage, sigHex, pubKey.toString('hex'));
        if (!verified) {
            return null;
        }
        return JSON.parse(verified);
    }

    return global;
})((typeof(window) !== 'undefined') ? MyCrypto : this);