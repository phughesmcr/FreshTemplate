import { asset } from "$fresh/runtime.ts";
import type { PageProps } from "$fresh/server.ts";
import { WebsiteMetadata } from "lib/constants.ts";

export default function App({ Component }: PageProps) {
  return (
    <html lang="en" dir="ltr">
      <head prefix="og: http://ogp.me/ns# fb: http://ogp.me/ns/fb# rdfa: http://www.w3.org/ns/rdfa# rdfs: http://www.w3.org/2000/01/rdf-schema# dcterms: http://purl.org/dc/terms/ foaf: http://xmlns.com/foaf/0.1/">
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <title></title>
        <meta name="description" content="" />

        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href={asset("/favicon-32x32.png")}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href={asset("/favicon-16x16.png")}
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={asset("/apple-touch-icon.png")}
        />

        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en" />
        <meta property="og:title" content="" />
        <meta property="og:description" content="" />
        <meta property="og:url" content="https://" />
        <meta property="og:image" content="https://" />
        <meta property="og:image:secure_url" content="https://" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="627" />
        <meta property="og:site_name" content="" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="" />
        <meta name="twitter:description" content="" />
        <meta name="twitter:image:src" content="https://" />

        <meta name="theme-color" content={WebsiteMetadata.THEME_COLOR} key="head-theme-color" />
        <meta name="application-name" content="" />
        <meta name="HandheldFriendly" content="True" />
        <meta name="MobileOptimized" content="320" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />

        <meta
          name="robots"
          content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        />
        <meta name="author" content="Peter Hughes - www.phugh.es" />
        <link
          rel="sitemap"
          type="application/xml"
          title="Sitemap"
          href={asset("/sitemap.xml")}
        />

        <link
          rel="manifest"
          href={asset("/site.webmanifest")}
          crossorigin="anonymous"
        />

        <link rel="stylesheet" href={asset("/styles.css")} />

        <script type="application/ld+json">
          {JSON.stringify(WebsiteMetadata.JSONLD)}
        </script>
        {WebsiteMetadata.SERVICE_WORKER_ENABLED && <script src={asset("/sw-register.js")}></script>}
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
}
