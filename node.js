import { createHelia } from 'helia'
import { peerIdFromKeys } from '@libp2p/peer-id'
import { unmarshalPrivateKey } from '@libp2p/crypto/keys'
import { base64pad } from 'multiformats/bases/base64'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { kadDHT, removePublicAddressesMapper } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'
import { webRTC } from '@libp2p/webrtc'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import defer from 'p-defer'
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'
import peers from './peers.js'

const RAW_CODEC = 0x55

// must have predictable keypair that is KAD-further from the CID being
// provided than the record host otherwise we could end up hosting the record
const key = 'MCAESQPSZ4nqIwRFUBw5JducNkksBaDLDn4i90x8ECT0uixaAMS2I86wEri+HkplxR7NeKVTO4SzHE83UvxVPNFrKCFo='
const privateKey = await unmarshalPrivateKey(base64pad.decode(key))
const peerId = await peerIdFromKeys(privateKey.public.bytes, privateKey.bytes)

const libp2p = await createLibp2p({
  peerId,
  addresses: {
    listen: [
      '/ip4/127.0.0.1/tcp/5688',
      '/webrtc'
    ]
  },
  transports: [
    tcp(),
    webRTC(),
    circuitRelayTransport({
      discoverRelays: 1
    })
  ],
  connectionEncryption: [
    noise()
  ],
  streamMuxers: [
    yamux()
  ],
  peerDiscovery: [
    bootstrap({
      list: [
        // the bootstrap node
        '/ip4/127.0.0.1/tcp/5668/p2p/12D3KooWNs7QzE7ssUSuJsuCEoN58SuQKsjn5ZYXAkzE2EZTQw3H'
      ]
    })
  ],
  services: {
    identify: identify(),
    kadDHT: kadDHT({
      protocol: '/ipfs/lan/kad/1.0.0',
      peerInfoMapper: removePublicAddressesMapper
    })
  }
})

const helia = await createHelia({
  libp2p
})

console.info('node.js host peer', peerId, 'listening on')
console.info(helia.libp2p.getMultiaddrs())

const connectedToBootstrapper = defer()

helia.libp2p.addEventListener('peer:connect', (event) => {
  const peerId = event.detail.toString()

  if (peers[peerId]) {
    console.info(`connected to ${peers[peerId]}`)
  }

  if (peerId === '12D3KooWNs7QzE7ssUSuJsuCEoN58SuQKsjn5ZYXAkzE2EZTQw3H') {
    connectedToBootstrapper.resolve()
  }
})
helia.libp2p.addEventListener('peer:disconnect', (event) => {
  const peerId = event.detail.toString()

  if (peers[peerId]) {
    console.info(`disconnected from ${peers[peerId]}`)
  }
})

// wait to be connected to the bootstrap peer
await connectedToBootstrapper.promise

const nodeData = new TextEncoder().encode('Hello from node!')
const nodeMultihash = await sha256.digest(nodeData)
const nodeCid = CID.createV1(RAW_CODEC, nodeMultihash)

console.info('adding block to blockstore')
await helia.blockstore.put(nodeCid, nodeData)

console.info('publishing provider record')
await helia.routing.provide(nodeCid, {
  onProgress: (evt) => {
    if (evt.detail?.name === 'PEER_RESPONSE' && evt.detail?.messageType === 'ADD_PROVIDER') {
      console.info('provider record stored with', peers[evt.detail?.from?.toString()])
    }
  }
})
console.info('published provider record')
