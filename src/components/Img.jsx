import { useState } from "react";

/** An <img> that disappears if it can't load (XIVAPI icons offline). */
export function Img(props) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img alt="" loading="lazy" {...props} onError={() => setFailed(true)} />;
}
