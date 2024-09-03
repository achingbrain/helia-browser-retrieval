import { createHelia } from 'helia'
import { peerIdFromKeys } from '@libp2p/peer-id'
import { unmarshalPrivateKey } from '@libp2p/crypto/keys'
import { base64pad } from 'multiformats/bases/base64'
import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import * as filters from '@libp2p/websockets/filters'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { kadDHT, removePublicAddressesMapper } from '@libp2p/kad-dht'
import { bootstrap } from '@libp2p/bootstrap'
import { webRTC } from '@libp2p/webrtc'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import defer from 'p-defer'
import { CID } from 'multiformats/cid'
import peers from './peers.js'

// must have predictable keypair that is KAD-further from the CID being
// provided than the record host otherwise we could end up hosting the record
const key = 'MCAESQGMr7f7eVzt6dBDyqImFpU4I0I7j82qvfBjR3Hc2brsb5OcOAPRaKKH5Q0ZMNF3EiUgKuqBOOSaX526mpayd3yA='
const privateKey = await unmarshalPrivateKey(base64pad.decode(key))
const peerId = await peerIdFromKeys(privateKey.public.bytes, privateKey.bytes)

const libp2p = await createLibp2p({
  peerId,
  transports: [
    webSockets({
      filter: filters.all
    }),
    webRTC(),
    circuitRelayTransport()
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
        '/ip4/127.0.0.1/tcp/5669/ws/p2p/12D3KooWNs7QzE7ssUSuJsuCEoN58SuQKsjn5ZYXAkzE2EZTQw3H'
      ]
    })
  ],
  services: {
    identify: identify(),
    kadDHT: kadDHT({
      protocol: '/ipfs/lan/kad/1.0.0',
      peerInfoMapper: removePublicAddressesMapper
    })
  },
  connectionGater: {
    denyDialMultiaddr: () => false
  }
})

const helia = await createHelia({
  libp2p
})

console.info('browser peer', peerId.toString(), 'listening on')
console.info(helia.libp2p.getMultiaddrs().map(ma => ma.toString()))

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

const nodeCid = CID.parse('bafkreictxahmbwxv2avhivjordcxbf6bxlfapdbawdahtepwyxa434zwiq')

console.info('getting block from blockstore')
const block = await helia.blockstore.get(nodeCid, {
  onProgress: (evt) => {
    if (evt.type === 'bitswap:network:find-providers') {
      console.info('bitswap finding providers')
    }

    if (evt.type === 'kad-dht:query:provider' && evt.detail.name === 'PROVIDER') {
      console.info('DHT found provider(s)', evt.detail.providers.map(prov => peers[prov.id.toString()]))
    }
  },
  // do not run forever
  signal: AbortSignal.timeout(10000)
})

console.info('block contents', new TextDecoder().decode(block))
