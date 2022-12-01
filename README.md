# Remote Pool Scheduler

This Docker application is a required component of the IVIS pool support feature.
Remote Pool Scheduler (RPS):
    
* accepts run requests/queries from an IVIS-core instance
  * forwards those requests to corresponding pool peers
* accepts run-induced requests from a pool peer
  * forwards those requests to the IVIS-core instance
  * performs SSL handshake with the IVIS-core instance

This way, only single public IP address allocation is required for the entire pool (which may save money).
Also, only one server/client certificate has to be issued. 

This application creates an illusion for the pool peers, that they communicate with
an IVIS-core instance (in an insecure way). Meanwhile, the application proxies
their communication along with the traffic encryption & client/server authentication.

## Configuration

### Ports

All ports and endpoints are configured in:

* `config/apache/vhosts.conf` - for proxy settings
* `config/apache/apache.conf` - `Listen` directives to allow the ports
* `config/default.yml`

To allow maximal granularity of control over each endpoint, RPS exposes 4 ports:

#### Public RPS port

* Access: Any source IP, SSL Client Auth required
* HTTPS: yes

Each request targets the `/rps` path (e.g. `https://myRPS.net:<PUBLIC_RPS_PORT>/rps/rest/of/the/path`).
This is the main entrypoint for IVIS-core requests, apart from the `/rps` path start,
it emulates the `ivis-remote-job-runner` interface (i.e. run, stop, status 
requests are supposed to be made to this endpoint).

#### Elasticsearch forwarding port

* Access: Pool peers only, use the host machine firewall to restrict access to this port
* HTTPS: no

This endpoint forwards requests to the IVIS-core instance's elasticseach endpoint.
This endpoint's address is the address all peer job-runners will connect their
elasticsearch clients to.

#### Trusted forwarding port

* Access: Pool peers only, use the host machine firewall to restrict access to this port
* HTTPS: no

Forwards requests to the trusted IVIS-core instance endpoint.

#### Sandbox forwarding port

* Access: Pool peers only, use the host machine firewall to restrict access to this port
* HTTPS: no

Forwards requests to the sandbox IVIS-core instance endpoint.