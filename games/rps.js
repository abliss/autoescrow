/**
 * autoescrow validator for Rock Paper Scissors
 */
function VerifierBuilder() {
    // An empty Verifier will simply ensure the players take their turns in
    // order and sign them properly.  Using the following mutators you can code
    // your game rules.

    // Each mutator takes a callback.  When the turns are going by to satisfy
    // the expectation of the mutator, the verifier will take care of business.
    // If anything goes wrong, the verifier will surface this.  When the
    // expected result is available, the callback will be called with the
    // result, the GameHeader, and the game's state object.  The callback should
    // (a) throw an error if the result is illegal; (b) mutate the state object
    // according to the result; (c) return undefined if the game is still in
    // progress, or a payout array if the game is over.

    // pulls a communally-chosen random number evenly distributed in [0..n-1].
    this.random = function(n, callback) {
    };
    // pulls a choice from the named current player in [0..n-1].
    this.choice = function(playerNum, n, callback) {
    };

    // After calling all mutators, call build() to get a validation function
    // which is ready to take signedturn arrays.
    this.build = function(state) {
        return function(crypto, turns) {

        };
    };
}

exports.validator = new VerifierBuilder().random(3, function(r, gameHeader, state) {
    if (r == 0) {
        return [1, 1];
    } else if (r == 1) {
        return [2, 0];
    } else if (r == 2) {
        return [0, 2];
    }
});



function makeDeck() {
    var RANKS = ["2", "3", "4", "5", "6", "7", "8", "9",
                 "T", "J", "Q", "K", "A"];
    var SUITS = ["C", "D", "H", "S"];
    var cards = [];
    RANKS.forEach(function(r) {
        SUITS.forEach(function(s) {
            cards.push(r + s);
        });
    });
    return cards;
}
var deckSizeF = function(state) {return state.deck.length;};
// how 2-player OFC would work
function computePayout(boards) {
}
var builder = new VerifierBuilder();
var deckSize = 52;
function dealCardTo(whom) {
    builder = builder.random(deckSize, function(r, meta, state) {
        var board = state.boards[state.currentPlayer] || [];
        board.push(state.deck.splice(r, 1)[0]);
        state.boards[state.currentPlayer] || [] = board;
        state.currentPlayer = (state.currentPlayer + 1) % meta.numPlayers;
        if (state.deck.size == 52 - 13 * meta.numPlayers) {
            return computePayout(state.boards);
        } else {
            return undefined;
        }
    }).build(
        {
            deck: makeDeck(),
            currentPlayer: 0,
            boards:[]
        });