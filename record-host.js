import { createHelia } from 'helia'
import { peerIdFromKeys } from '@libp2p/peer-id'
import { unmarshalPrivateKey } from '@libp2p/crypto/keys'
import { base64pad } from 'multiformats/bases/base64'
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { kadDHT, removePublicAddressesMapper } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'
import peers from './peers.js'

// must have predictable keypair that is KAD-close(r) to the CIDs being
// provided than the bootstrap peer or the publishing peers - this ensure we
// be selected to host the provider records
const key = 'MCAESQDrLftFLe02J8xLfilzCCNJMNomxY4WLSzdIFXZjD8yTLShV3bAL5UAFNTHLDqYFLODIzmCg7RllgTR2szpVwZM='
const privateKey = await unmarshalPrivateKey(base64pad.decode(key))
const peerId = await peerIdFromKeys(privateKey.public.bytes, privateKey.bytes)

const libp2p = await createLibp2p({
  peerId,
  addresses: {
    listen: [
      '/ip4/127.0.0.1/tcp/5678',
      '/ip4/127.0.0.1/tcp/5679/ws'
    ]
  },
  transports: [
    tcp(),
    webSockets()
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
      peerInfoMapper: removePublicAddressesMapper,
      clientMode: false
    })
  }
})

const node = await createHelia({
  libp2p
})

console.info('record host peer', peerId, 'listening on')
console.info(node.libp2p.getMultiaddrs())

node.libp2p.addEventListener('peer:connect', (event) => {
  const peerId = event.detail.toString()

  if (peers[peerId]) {
    console.info(`connected to ${peers[peerId]}`)
  }
})
node.libp2p.addEventListener('peer:disconnect', (event) => {
  const peerId = event.detail.toString()

  if (peers[peerId]) {
    console.info(`disconnected from ${peers[peerId]}`)
  }
})

