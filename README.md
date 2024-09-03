# Resolving content from a browser Helia node

This is a demo repo that shows how providing/resolving works, when network peers have common transports.

## Theory

Publishing content involves a DHT provide, and resolving content looks up those providers.

What follows is a brief overview of how this works.

### KAD-DHT operations

- KAD-DHT operations usually involve a key and a value that is either being read or written
- Every node on the KAD-DHT network has a KAD-ID derived from their PeerID which can be used to calculate the "distance" from the KAD-ID of the key that is being operated on
- A KAD-ID is the sha256 hash of either the key or the PeerID
- The distance is the XOR value of the two KAD-IDs
- The KAD-ID of a CID is the sha256 hash of the CID's multihash (not the whole CID since two v1 CIDs with different codecs could share a multihash).
- The KAD-ID of a PeerID is the sha256 hash of the PeerId's multihash, e.g. a sha256 hash of the public key (for RSA keys) or an identity hash containing the public key wrapped in a [protobuf](https://github.com/libp2p/specs/blob/master/peer-ids/peer-ids.md#keys) (for Ed25519 or secp256k1 keys).

That is:

```
distance = XOR(sha256(key), sha256(peerID))
```

### Publishing content

To publish content on the IPFS network a few things happen.

1. The block is added to the blockstore of the local host
2. A `helia.routing.provide` call is made and the CID of the block is passed in
3. This tells the network that the current node can provide the block that corresponds to the CID:
    - The node calculates the KAD-ID of the CID's multihash
    - The node searches the network for the 20 peers who's KAD-IDs have the lowest XOR difference to the KAD-ID of the CID's multihash
    - The node tells those peers to store a provider record
    - The provider record contains the multiaddr(s) of the node

### Resolving content

When resolving content, the following happens:

1. The resolving node makes a `helia.routing.findProviders` call with the CID to find providers for
1. The KAD-ID of the CID's multihash is calculated
1. The resolving node selects the set of peers it knows that are closest to the target KAD-ID
1. It asks those peers if any either have a provider record for the CID or if they know any peers that are KAD-closer to the KAD-ID of the CID's multihash than they are
1. If no peers have the provider record but they do know closer peers, the resolving node dials the closer peers and repeats step 4
1. Eventually the resolving node either finds some peers that host the provider record, or it runs out of dialable peers on the network
1. If provider record(s) are found, it dials the multiaddrs stored in the record
1. When a connection is opened to a peer that supports bitswap, the protocol begins and blocks are exchanged

### Challenges

Being able to publish and resolve content depends on the publisher and resolver having the same view of the network.

That is, the resolver needs to be able to find some of the same 20x peers that the publisher chose to store the provider records.

This is challenging on non-homogenous networks such as the IPFS DHT where you cannot guarentee that all peers share the same transports.

E.g. if the majority of the network speaks only TCP and QUIC, then the majority of the network will be undiallable to browser nodes so they will fail to resolve content.

This situation is improving with the addition of `WebRTC-direct` and `WebTransport` transports to `go-libp2p` (the majority implementation), and the upcoming addition of wildcard SSL certificates for all `WebSocket` listeners.

End of theory.

---

## Demo

There are 4x nodes here with pre-determined PeerIDs so we can predict which will be chosen to store the provider record.

This is necessary as with a very small number of peers it's possible that the publishing node will have the KAD-closest PeerID on the network.

In a live network it is assumed that there will be enough nodes with a diverse enough range of PeerIDs that this would be unlikely.

To run the demo:

1. Start the bootstrapper

This node listens on TCP and WebSocket addresses. It is a DHT server so will
respond to DHT queries.

It's PeerID is not as KAD-close to the target multihash as the record host, so
when asked for peers closer to the multihash, it will respond with the details
of the record host.

```console
 % node bootstrapper.js
bootstrap peer PeerId(12D3KooWNs7QzE7ssUSuJsuCEoN58SuQKsjn5ZYXAkzE2EZTQw3H) listening on
[
  Multiaddr(/ip4/127.0.0.1/tcp/5668/p2p/12D3KooWNs7QzE7ssUSuJsuCEoN58SuQKsjn5ZYXAkzE2EZTQw3H),
  Multiaddr(/ip4/127.0.0.1/tcp/5669/ws/p2p/12D3KooWNs7QzE7ssUSuJsuCEoN58SuQKsjn5ZYXAkzE2EZTQw3H)
]
```

2. Start the DHT record host

This node listens on TCP and WebSocket addresses so it is dialable from node.js
and browsers and is a KAD-DHT server so will host the provider record when asked
to do so.

It has the KAD-closest PeerID to the target multihash so it will be chosen to
host the provider record by the node.js peer.

```console
% node record-host.js
record host peer PeerId(12D3KooWCreBrsHHGvVTZnYm2AErS9JqqWKN9gDUuXkV6BWfyMiz) listening on
[
  Multiaddr(/ip4/127.0.0.1/tcp/5678/p2p/12D3KooWCreBrsHHGvVTZnYm2AErS9JqqWKN9gDUuXkV6BWfyMiz),
  Multiaddr(/ip4/127.0.0.1/tcp/5679/ws/p2p/12D3KooWCreBrsHHGvVTZnYm2AErS9JqqWKN9gDUuXkV6BWfyMiz)
]
connected to bootstrapper
```

3. Start the node.js Helia node and wait for publishing to finish

```console
% node node.js
node.js host peer PeerId(12D3KooWD8LRAF5MiAWfcCP9bnR1f2ekBNsbiMEL34j9PJsLoVoX) listening on
[
  Multiaddr(/ip4/127.0.0.1/tcp/5688/p2p/12D3KooWD8LRAF5MiAWfcCP9bnR1f2ekBNsbiMEL34j9PJsLoVoX)
]
connected to bootstrapper
adding block to blockstore
publishing provider record
connected to record host
provider record stored with record host <- stored with closest peer (e.g. 1/20)
provider record stored with bootstrapper <- stored with second closest peer e.g. (2/20)
published provider record
```

4. Finally resolve the content from the browser

```console
% npx pw-test browser.js
- Count not find a test runner. Using "none".
ℹ Browser "chromium" setup complete.
browser peer 12D3KooWRDuUCpyb69N5aBnEaCgwCW4PjdVjUMev7pZfh9RBZHUb listening on
[]
connected to bootstrapper
getting block from blockstore
bitswap finding providers
DHT found provider(s) [ 'node.js peer' ]
DHT found provider(s) [ 'node.js peer' ]
connected to record host
connected to node.js peer        <- circuit relay dial, perform WebRTC SDP handshake
disconnected from node.js peer   <- circuit relay hang up after SDP handshake
connected to node.js peer        <- direct connection established via WebRTC
block contents Hello from node!
```
