<script lang="ts">
  let { data } = $props();
</script>

<h1>Server-rendered</h1>
<p>%transformed%</p>
<dl>
  <dt>visits</dt><dd id="visits">{data.visits}</dd>
  <dt>secret</dt><dd id="secret">{data.secret}</dd>
  <dt>address</dt><dd id="address">{data.address}</dd>
  <dt>deployment</dt><dd id="deployment">{data.deploymentId}</dd>
  <dt>assets</dt><dd id="assets">{data.assets}</dd>
  <dt>request id</dt><dd id="request-id">{data.requestId}</dd>
  <dt>user agent</dt><dd id="user-agent">{data.userAgent}</dd>
</dl>
