// Bundled open-licence fonts (SIL OFL). The same TTF files are used on screen and embedded in the PDF,
// which KDP requires (all fonts must be embedded).

import playfairRegular from '@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf?url';
import playfairBold from '@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf?url';
import playfairItalic from '@expo-google-fonts/playfair-display/400Regular_Italic/PlayfairDisplay_400Regular_Italic.ttf?url';
import loraRegular from '@expo-google-fonts/lora/400Regular/Lora_400Regular.ttf?url';
import loraBold from '@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf?url';
import loraItalic from '@expo-google-fonts/lora/400Regular_Italic/Lora_400Regular_Italic.ttf?url';
import interRegular from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf?url';
import interBold from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf?url';
import interItalic from '@expo-google-fonts/inter/400Regular_Italic/Inter_400Regular_Italic.ttf?url';
import caveatRegular from '@expo-google-fonts/caveat/400Regular/Caveat_400Regular.ttf?url';
import caveatBold from '@expo-google-fonts/caveat/700Bold/Caveat_700Bold.ttf?url';
import { FONTS, type FontStyle } from '../core/text';
import type { FontId } from '../core/types';

export const FONT_URLS: Record<FontId, Record<FontStyle, string>> = {
  playfair: { regular: playfairRegular, bold: playfairBold, italic: playfairItalic },
  lora: { regular: loraRegular, bold: loraBold, italic: loraItalic },
  inter: { regular: interRegular, bold: interBold, italic: interItalic },
  caveat: { regular: caveatRegular, bold: caveatBold, italic: caveatRegular },
};

/** CSS font-family for a font + style. Each style is registered as its own family so metrics match exactly. */
export function cssFamily(font: FontId, style: FontStyle): string {
  return `${FONTS[font].css} ${style}`;
}

let loaded: Promise<void> | null = null;

export function loadFonts(): Promise<void> {
  if (loaded) return loaded;
  loaded = (async () => {
    const faces: FontFace[] = [];
    for (const [id, styles] of Object.entries(FONT_URLS) as [FontId, Record<FontStyle, string>][]) {
      for (const [style, url] of Object.entries(styles) as [FontStyle, string][]) {
        faces.push(new FontFace(cssFamily(id, style), `url(${url})`));
      }
    }
    await Promise.all(
      faces.map(async (f) => {
        await f.load();
        document.fonts.add(f);
      }),
    );
  })();
  return loaded;
}

const bytesCache = new Map<string, Promise<ArrayBuffer>>();
export function fontBytes(font: FontId, style: FontStyle): Promise<ArrayBuffer> {
  const url = FONT_URLS[font][style];
  if (!bytesCache.has(url)) bytesCache.set(url, fetch(url).then((r) => r.arrayBuffer()));
  return bytesCache.get(url)!;
}
