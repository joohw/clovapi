const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect width="16" height="16" fill="#000000"/>
  <g fill="#ffffff">
    <rect x="3" y="2" width="3" height="1"/>
    <rect x="2" y="3" width="5" height="1"/>
    <rect x="1" y="4" width="6" height="1"/>
    <rect x="2" y="5" width="4" height="1"/>
    <rect x="10" y="2" width="3" height="1"/>
    <rect x="9" y="3" width="5" height="1"/>
    <rect x="9" y="4" width="6" height="1"/>
    <rect x="10" y="5" width="4" height="1"/>
    <rect x="3" y="7" width="3" height="1"/>
    <rect x="2" y="8" width="5" height="1"/>
    <rect x="1" y="9" width="6" height="1"/>
    <rect x="2" y="10" width="4" height="1"/>
    <rect x="10" y="7" width="3" height="1"/>
    <rect x="9" y="8" width="5" height="1"/>
    <rect x="9" y="9" width="6" height="1"/>
    <rect x="10" y="10" width="4" height="1"/>
    <rect x="7" y="6" width="2" height="4"/>
    <rect x="8" y="9" width="1" height="2"/>
    <rect x="9" y="11" width="1" height="1"/>
    <rect x="10" y="12" width="1" height="1"/>
    <rect x="9" y="13" width="1" height="1"/>
    <rect x="8" y="14" width="1" height="1"/>
  </g>
</svg>`;

export function GET() {
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400'
    }
  });
}
