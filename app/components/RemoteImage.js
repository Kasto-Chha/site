import Image from "next/image";

import { canOptimizeImage } from "../../lib/images";

// next/image for URLs an editor typed in (battle photos, featured heroes) or
// that come from a platform (reel covers). Approved hosts go through the
// optimizer as before; any other https host renders unoptimized — the browser
// fetches it directly, and our server never does. See lib/images.js.
export default function RemoteImage({ src, alt, ...props }) {
  return <Image src={src} alt={alt} unoptimized={!canOptimizeImage(src)} {...props} />;
}
