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
import { circuitRelayServer } from '@libp2p/circuit-relay-v2'
import peers from './peers.js'

// must have predictable keypair that is KAD-distant from the CIDs being
// provided, otherwise the bootstrapper could end up hosting the provider record
const key = 'MCAESQIzd9+zjw6iJGzI9RVFPsLrv2LXABf/dDpsdmaWiTcebwdv9VT4Giuwp4eq/eIDVi4MCWtuV01s26sVfQM8zrhQ='
const privateKey = await unmarshalPrivateKey(base64pad.decode(key))
const peerId = await peerIdFromKeys(privateKey.public.bytes, privateKey.bytes)

const libp2p = await createLibp2p({
  peerId,
  addresses: {
    listen: [
      '/ip4/127.0.0.1/tcp/5668',
      '/ip4/127.0.0.1/tcp/5669/ws'
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
  services: {
    identify: identify(),
    kadDHT: kadDHT({
      protocol: '/ipfs/lan/kad/1.0.0',
      peerInfoMapper: removePublicAddressesMapper,
      clientMode: false
    }),
    circuitRelayServer: circuitRelayServer()
  }
})

const node = await createHelia({
  libp2p
})

console.info('bootstrap peer', peerId, 'listening on')
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
