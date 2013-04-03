/**
 * autoescrow validator for player Rock Paper Scissors
 */
function checkSignatures(crypto, signedGameState) {
    // Each player signs the gameHeader plus all
    // turns up to and inculding eir own last turn.
    var numPlayers = signedGameState.gameState.gameHeader.players.length;
    var doc = crypto.serialize(signedGameState.gameState.gameHeader);
    var docs = [];
    for (var i = 0; i < numPlayers; i++) {
        docs.push(doc);
    }
    signedGameState.gameState.turns.forEach(function(turn) {
        doc += crypto.serialize(turn);
        docs[turn.who] = doc;
    });
    for (i = 0; i < numPlayers; i++) {
        if (!signedGameState.signatures[i]) {
            throw new Error("Missing signature: " + i);
        }
        if (!crypto.verify(
                docs[i],
                signedGameState.signatures[i],
                signedGameState.gameState.gameHeader.players[i].key)) {
            throw new Error("Bad signature " + i);
        }
    }
    return true;
}

function TurnStack(origTurns) {
    var turns = origTurns.slice();
    var depleted = undefined;

    this.peek = function() {
        if (turns.length > 0) {
            return turns[0];
        } else {
            depleted = new Error("depleted");
            throw depleted;
        }
    };
    this.poll = function() {
        if (turns.length > 0) {
            return turns.shift();
        } else {
            depleted = new Error("depleted");
            throw depleted;
        }
    };
    this.size = function() {
        return turns.length;
    };
    this.wasDepleted = function() {
        return depleted;
    };
}

function EvaluatorBuilder(numPlayers) {
    // An empty Evaluator will simply ensure the players take their turns in
    // order and sign them properly.  Using the following mutators you can code
    // your game rules.

    // Each mutator takes a callback.  When the turns are going by to satisfy
    // the expectation of the mutator, the evaluator will take care of business.
    // If anything goes wrong, the evaluator will surface this.  When the
    // expected result is available, the callback will be called with the
    // result, the GameHeader, and the game's state object.  The callback should
    // (a) throw an error if the result is illegal; (b) mutate the state object
    // according to the result; (c) return undefined if the game is still in
    // progress, or a payout array if the game is over.

    var visitors = [];

    // Sets expectation about the next turn. Each visitor will be passed the
    // turn stack and the running state obj; it should throw an error if
    // expectations are not met, otherwise mutate the stated object.
    // the turn stack has peek() and poll() methods to access the next turn
    // (and, in the second case, remove it from further processing). These
    // functions will either return the next turn, if there is one, or throw a
    // depletion error, which the visitor should allow to propagate. This
    // depletion error will be considered a successful termination of an
    // intermediate turn-chain; all other errors will be considered a failure of
    // verification.  Note that any mutations made to the state before throwing
    // *will* be persisted in the returned object! So you can set
    // state.nextPlayer or state.payout and then throw.
    this.addVisitor = function(visitor) {
        visitors.push(visitor);
        return this;
    };
    // ==== Utilities for making Vistors
    // Just checks that the turn is being taken by the correct nextPlayer
    function checkWhoVisitor() {
        return function(turnStack, state) {
            var who = turnStack.peek().who;
            if (who !== state.nextPlayer) {
                throw new Error("Wrong player: was " + who +
                                " wanted " +  state.nextPlayer);
            }
        };
    }

    // extracts a simultaneous choice from each player in the range
    // [0... bound-1]. leaves the result in state.choices.
    // whoNext: the next player to play after the choice.
    // This works by first extracting a hash from each player which commits
    // them to a secret choice, then forcing each player to reveal the secret,
    // and verifying the hash.
    this.simulChoice = function(bound, whoNext) {
        // collect one hash from each player
        this.addVisitor(function(turns, state) {
            state.simulChoiceQueue = [];
            state.choices = [];
        });
        // collect one hash from each player, store in state.simulChoiceQueue
        for (var i = 0; i < numPlayers; i++) {
            this.addVisitor(checkWhoVisitor());
            this.addVisitor(
                function(turns, state) {
                    var hash = turns.poll().hash;
                    if (!hash) throw new Error("Wanted a hash!");
                    state.simulChoiceQueue.push(hash);
                    state.nextPlayer = (state.nextPlayer + 1) % numPlayers;
            });
        }
        // collect one salt from each player, verify their spuds
        for (i = 0; i < numPlayers; i++) {
            this.addVisitor(checkWhoVisitor());
            this.addVisitor(
                function(turns, state, crypto) {
                    var salt = turns.poll().salt;
                    if (!salt) throw new Error("Wanted a salt!");
                    var oldHash = state.simulChoiceQueue.shift();
                    // TODO: skip check for speed when trusted
                    var newHash = crypto.hash(crypto.serialize(salt));
                    if (oldHash !== newHash) {
                        throw new Error("hash mismatch! expected " + oldHash +
                                        " got " + newHash);
                    }
                    if (!((salt.spud >= 0) && (salt.spud < bound))) {
                        throw new Error("Spud out of bounds! wanted " +
                                        salt.spud + "<" + bound);
                    }
                    state.choices[state.nextPlayer] = salt.spud;
                    state.nextPlayer = (state.nextPlayer + 1 < numPlayers) ?
                        (state.nextPlayer + 1) : whoNext;
                });
        }
        return this;
    };

    // extracts a public choice from the named current player in [0..n-1].
    // leaves the answer in state.spud.
    this.choice = function(playerNum, bound, whoNext) {
        this.addVisitor(
            function(turns, state, crypto) {
                state.nextPlayer = playerNum;
                var turn = turns.poll();
                if (turn.who != playerNum) {
                    throw new Error("Wrong who! wanted " + playerNum +
                                    "got  " + turn.who);
                }
                if (!((turn.choice >= 0) && (turn.choice < bound))) {
                    throw new Error("Bad choice! wanted " + turn.choice + " <" +
                                    bound);
                }
                state.choice = turn.choice;
                state.nextPlayer = whoNext;
            });
    };

    // After calling all mutators, call build() to get a validation function
    // which his ready to take signed turn arrays.
    this.build = function() {
        return function(crypto, signedGameState) {
            checkSignatures(crypto, signedGameState);
            var state = {nextPlayer:0};
            var turns = new TurnStack(signedGameState.gameState.turns.slice());
            var n = 0;
            try {
                visitors.forEach(function(v) { v(turns, state, crypto); n++;});
            } catch (e) {
                if (e !== turns.wasDepleted()) {
                    e.message += "\nturn: " +
                        (signedGameState.gameState.turns.length -
                         turns.size() - 1);
                    e.message += "\nvisitor: " + n;
                    throw e;
                }
            }
            return state;
        };
    };
}

this.evaluator = new EvaluatorBuilder(2).simulChoice(3, -1).addVisitor(
    function(turns, state) {
        var diff = (3 + state.choices[1] - state.choices[0]) % 3;
        if (diff == 0) {
            state.payout = [1, 1];
        } else if (diff == 1) {
            state.payout = [0, 2];
        } else if (diff == 2) {
            state.payout = [2, 0];
        } else {
            throw new Error("inconceivable!");
        }
    }
).build();


this;