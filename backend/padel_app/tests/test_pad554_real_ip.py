"""PAD-554 (B-382): the host nginx hands the backend the real client address, and only that.

Shape checks over the tracked host nginx files (infra/nginx, hand-applied on the VM):
- conf.d resolves $remote_addr from CF-Connecting-IP, only for Cloudflare's published ranges;
- every proxied location of every vhost forwards `X-Real-IP $remote_addr` (nginx's
  proxy_set_header replaces any copy the client sent), which client_ip() reads alone.
The behaviour of client_ip() itself is in test_auth_rate_limit.py.
"""
import ipaddress
import pathlib
import re

NGINX = pathlib.Path(__file__).resolve().parents[3] / "infra" / "nginx"

# https://www.cloudflare.com/ips-v4 and ips-v6, fetched 2026-10-08.
CLOUDFLARE = {
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
    "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
    "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
    "2a06:98c0::/29", "2c0f:f248::/32",
}


def test_nginx_trusts_cf_connecting_ip_only_from_cloudflare():
    conf = (NGINX / "conf.d" / "levapp-cloudflare-real-ip.conf").read_text()
    trusted = set(re.findall(r"^set_real_ip_from (\S+);", conf, re.M))
    assert trusted == CLOUDFLARE
    for net in trusted:
        ipaddress.ip_network(net)  # every entry parses
    assert re.search(r"^real_ip_header CF-Connecting-IP;", conf, re.M)
    assert re.search(r"^real_ip_recursive off;", conf, re.M)
    assert "X-Forwarded-For" not in re.sub(r"#.*", "", conf)


def test_every_proxied_location_forwards_x_real_ip():
    for vhost in sorted((NGINX / "sites-available").iterdir()):
        text = vhost.read_text()
        for block in re.findall(r"location [^{]+\{(.*?)\n    \}", text, re.S):
            if "proxy_pass" in block:
                assert "proxy_set_header X-Real-IP $remote_addr;" in block, (vhost.name, block[:80])
