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
    global.verify = function(string, hexSig, pub) {
        var sigl1 = hex2latin1(hexSig);
        var publ1 = hex2latin1(pub);
        // TODO: mixing latin1 and utf8 here?
        var signedMessage = Nacl.encode_latin1(sigl1.substring(0,32) +
                                               string + sigl1.substring(32));

        var verified = Nacl.crypto_sign_open(signedMessage,
                                             Nacl.encpode_latin1(publ1));
        return (verified !== null);
    };
    global.randomHex = function(num) {
        return Nacl.to_hex(Nacl.random_bytes(num));
    }
    // TODO: should be a protobuffer maybe?
    global.serialize = function(obj) {
        return JSON.stringify(obj);
    }
    global.deserialize = function(blob) {
        return JSON.parse(blob);
    }
    return global;
})((typeof(window) !== 'undefined') ? MyCrypto : this);