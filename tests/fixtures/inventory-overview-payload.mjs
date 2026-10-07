/** Synthetic service contract fixture; contains no production account or stock data. */
export function overviewPayload(organizationId, options = {}) {
  const stamp = options.stale ? new Date(Date.now() - 3600_000).toISOString() : new Date().toISOString();
  const unavailable = options.unavailable;
  const pools = options.empty ? [] : [
    { poolId: 'pool-main', siteCount: 2, provisioning: 'ready' },
    { poolId: 'pool-pending', siteCount: 1, provisioning: 'pending' },
    { poolId: 'pool-failed', siteCount: 1, provisioning: 'failed' },
  ];
  const sites = options.empty ? [] : [
    { siteId: 'site-north', poolId: 'pool-main', provisioning: 'ready' },
    { siteId: 'site-south', poolId: 'pool-main', provisioning: 'ready' },
    { siteId: 'site-pending', poolId: 'pool-pending', provisioning: 'pending' },
    { siteId: 'site-failed', poolId: 'pool-failed', provisioning: 'failed' },
  ];
  return { organizationId, overview: {
    schema: 'dinkuskit.inventory.account-overview/v1',
    snapshot: { sampledAt: stamp, asOf: stamp, health: { availability: 'unavailable', reason: 'live_pool_health_not_read' } },
    metadata: unavailable ? { availability: 'unavailable', reason: unavailable } : { availability: 'available' },
    counts: unavailable ? null : { pools: pools.length, sites: sites.length },
    pools: unavailable ? null : pools, sites: unavailable ? null : sites,
  } };
}
