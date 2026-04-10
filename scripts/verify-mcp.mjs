import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const [endpoint, token] = process.argv.slice(2)

if (!endpoint || !token) {
  console.error('Usage: node scripts/verify-mcp.mjs <endpoint> <token>')
  process.exit(1)
}

const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  requestInit: {
    headers: new Headers({
      Authorization: `Bearer ${token}`,
    }),
  },
})

const client = new Client({ name: 'he-calendar-verify', version: '1.0.0' })

try {
  await client.connect(transport)
  const { tools } = await client.listTools()
  console.log('TOOLS', tools.map(tool => tool.name).join(', '))

  const result = await client.callTool({
    name: 'get_date_info',
    arguments: { date: '2026-04-01' },
  })

  console.log('CALL_OK', result.content?.[0]?.type)
  console.log('CALL_TEXT', result.content?.[0]?.text?.slice(0, 200) || '')
} finally {
  await client.close().catch(() => {})
}
