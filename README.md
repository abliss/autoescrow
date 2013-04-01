autoescrow
==========

A lightweight protocol for selling trusted computation

Let's suppose two people who do not know or trust each other want to play a game
(e.g. poker) online for real money.  What could go wrong?

1. The players may not be able to find a centralized payment processor they both
trust to transmit the winnings.

2. A player could cheat (e.g. the one shuffling the cards stacks the deck; the
one drawing cards peeks at the top card).

3. A player with a bad hand could simply walk away and stop playing; could also,
if confronted, disagree about how much time had passed.

4. Even if both players play fairly to completion and payment is possible, the
losing player could disagree about who won, or just refuse to pay up.

Problem #1 is solved if the players agree to play for Bitcoin (and consider that
"real money").  Problem #2 has been solved for many games using standard
one-way-hash and public-key-crypto techniques.  Autoescrow exists to solve
problem #4.  Problem #3 could be solved by using the Bitcoin blockchain as a
decentralized public incorruptible monotonic clock; however it has coarse
granularity, requires transaction fees, and spams the blockchain--so autoescrow
can optionally provide a clock as well.

P1 and P2 agree on a game to play and an evaluator (code for a function which
determines who has won the game).  They sign their agreement and deposit funds
into a common address controlled by an autoescrow server they both trust.  Then
they play their game.  The game is coded so that the winner, through the process
of playing, receives a special cryptographically-signed object. This object,
when verified by the evaluator on the autoescrow server, establishes the win.
The server then pays out the winnings from the common address.

This repo contains the reference implementation for the autoescrow protocol atop
node.js.  By design, autoescrow...

# DOES communicate with the players through a RESTful http interface.

# DOESN'T provide a communication channel for the players to talk to each other.

# DOES communicate securely with a bitcoin daemon.

# DOESN'T manage a address, connect to bitcoin peers, or do anything else bitcoind does.

# DOES keep a private key and sign all its messages.

# DOESN'T provide secure communications (e.g. SSL) or keep any other secret
state besides its private key.  All content, and all messages between players
and the autoescrow server, are considered public.

# DOES define a small namespace for its RPCs.

# DOESN'T define a namespace for content.  All content is addressable only by
its sha1sum.

# DOES some light caching and indexing for performance.

# DOESN'T actually store any data.  The players are responsible for ensuring the
persistence of all necessary information for their game.  The exception to this
is when autoescrow is used to enforce timeout claims (see below).

# DOES require both players to trust the server (that it will remain available,
that its private key will remain secret, that its autoescrow implementation is
not buggy, that it will not be hacked, that it will compute correctly, that its
administrator will not abscond with the common address, etc.).

# DOESN'T trust the players or require them to trust each other.

# DOES consistently identify itself by its public key for the purposes of
establishing that trust (available from /pubKey and registered elsewhere).

# DOESN'T attempt to identify the players, verify anything about them, track
their statistics, or detect collusion in multiplayer games.

# DOES ensure that evaluators (i.e. untrusted code) will terminate within a
bounded amount of resources (through some combination of code review,
sandboxing, rlimit, etc)

# DOESN'T make any warranty that the evaluator faithfully represents the rules
of the game the players think they're playing.  There is no human arbitration
here; the evaluator is definitive.

# DOES use JSON for the wire format, the Camlistore signing protocol.

# DOESN'T have to be implemented in node.js, or use javascript for evaluators,
or backed by any particular cache/storage/pubsub/bitcoin servers.  Interoperable
reimplementations are welcome.

==== The flow normal flow

1. a player POSTs a gameHeader to /new: 
{
   evaluator: "sha1sum of a .jsfile defining evaluator. For now, assume to a js module.",
   players: [
     {
       key: "public key",
       address: "BTC address to receive winnings",
       notify: "url to notify player of timeout claims",
     }
   ],
   rake: (BTC value of the rake),
   blockStamp: "hash of a BTC block from the main blockchain to establish minimum-timestamp",
   timeLimit: (maxmium time (in seconds) which a player is allowed per turn)
   maxTurns: (maxmimum number of turns in this game)
   extension: {opaque object relevant to the evaluator, such as;
     stake: the number of BTC per unit of betting
   }
} 

2. The server validates the structure (verifying that the notify urls are
acceptable and the evaluator is whitelisted), creates a new bitcoin address
devoted to this game and returns/publishes this warrant:

{
   address: "bitcoin address",
   gameId: "sha1 of gameHeader",
   camliVersion: 1,
   camliSigner: "server's public key"
,"camliSig":"signature of above"}


2. Each player who wants to play sends the ante to the address.

3. Players should ensure there is enough money in the address for their maximum
payout before they start to play. If somebody didn't ante and the address is
short, all payouts will be reduced by the same fraction.

3. The players play amongst themselves the game reaches a terminal state.

4. a player (probably a winning one) POSTs a redemption to
/redeem:

{
    gameHeader: {gameHeader as above},
    evaluator: "an evaluator which matches the sha1 in the gameHeader",
    warrant: {warrant as above},
    turnChain: [a terminal turnChain]
}

(TODO: maybe we will allow references to these objects, but for now they must all be included)

5. The server performs the following validation:
   a. is the warrant a valid one signed by me?
   b. is the gameHeader the correct one referenced in the warrant?
   c. is the evaluator the one referenced in the gameHeader?
   d. pass the turnChain to the evaluator along with the gameHeader and the current value of the address.
   e. the evaluator makes sure the turnChain is valid and terminal, and returns a list of payouts.
   f. the server makes sure there is enough in the address to cover all the payouts plus the rake.  If not, the payouts are reduced equally.
   g. the server empties out the address.

==== What happens if one player stops playing?

A timeout claim can be resolved in several ways, depending on the url in the
player.notify.  

===== If it's "bitcoin:", we can resolve it using the bitcoin blockchain:

4a. A player who has been jilted posts a timeoutComplaint to the bitcoin blockchain:
{
    gameHeader: "the game being played",
    defendant: "public key of the player who walked away",
    turnChain: [a nonterminal turnChain in which the defendant may take a turn]
,"camliSig":"signature of claimant"}

5a. gameHeader.timeLimit seconds go by in the blockchain.

6a. The claimant player POSTs following to /timeout:
{
    timeoutComplaintRef: "reference to the timeoutComplaint embedded in the blockchain",
    warrant: "warrant issued for gameHeader in the timeoutComplaint",
    evaluator: "evaluator referenced in the gameHeader"
}

7a. The server verifies:
   a. is the timeoutComplaintRef a well-formed complaint with defendant and claimant in the player list?
   b. is the warrant for this gameHeader validly signed by me?
   c. have gameHeader.blockLimit blocks passed with no timeoutResolution in the blockChain?
   c. is the evaluator the one referenced in gameHeader?
   d. pass the timeoutComplaint to the evaluator.  It creates a new, longer, possibly terminal turnChain and returns it.
   e. the server signs the new turnChain into a timeoutResolution which is returned, published, and put into the blockchain.

To refute the claim, the defendant can notice the claim in the blockchain and
publish a TimeoutResolution into the blockchain including a turnChain with
greater length than the one in the TimeoutComplaint.

===== If it's "http:", the autoescrow server can arbitrate the claim:

4a. A player who has been jilted posts a timeoutComplaint to /timeoutComplaint
{
    gameHeader: "the game being played",
    defendant: "public key of the player who walked away",
    turnChain: [a nonterminal turnChain in which the defendant may take a turn]
,"camliSig":"signature of claimant"}

5a. The server POSTS the timeoutComplaint to the defendant's notify url.  The
server should return either 200 with a timeoutResolution, or a 404 if none is
there.  But regardless of whether there's a response, the server returns to a
signed and timestampted receipt to the claimant, who must now wait timeLimit
seconds.


6a. The claimant player POSTs following to /timeout:
{
    timeoutComplaintReceipt: (the receipt obtained in 5a)
    warrant: "warrant issued for gameHeader in the timeoutComplaint",
    evaluator: "evaluator referenced in the gameHeader"
}

7a. The server again POSTs the timeoutComplaint to the defendant's notify url.
If it does not respond promptly with a 200 TurnResolution, the server resolves
in favor of the claimant.  Note this means that each player needs to keep a
notifyServer up and running until the game has been paid out.

   a. is the timeoutComplaintRef a well-formed complaint with defendant and claimant in the player list?
   b. is the warrant for this gameHeader validly signed by me?
   c. have gameHeader.blockLimit blocks passed with no timeoutResolution in the blockChain?
   c. is the evaluator the one referenced in gameHeader?
   d. pass the timeoutComplaint to the evaluator.  It creates a new, longer, possibly terminal turnChain and returns it.
   e. the server signs the new turnChain into a timeoutResolution which is returned, published, and put into the blockchain.


==== NOTES on turnChains
- a turnChain grows monotonically (old turns are immutable), one turn at a time.
- a valid turnChain should require each turn be signed by the next player in round-robin.
- a turnChain definition should be equitable to all players until all players have signed.
  (if it's a position-sensitive game, include an entire round in one terminal turnChain.
  if cards are dealt, don't reveal them until the last player has signed)l
- The evaluator may be asked to generate multiple extended turnChains from a single timeoutComplaint.
  They must all be equipreferable to all players.
