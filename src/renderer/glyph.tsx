import { Renderer } from "@freelensapp/extensions";

import type { ComponentProps } from "react";

// A decorative host icon. Material icons render their name as ligature text, so
// without `aria-hidden` a button labelled "Reset" is announced "restart_alt Reset".
export function Glyph(props: ComponentProps<typeof Renderer.Component.Icon>) {
  return <Renderer.Component.Icon aria-hidden {...props} />;
}
