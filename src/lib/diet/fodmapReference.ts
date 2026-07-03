/**
 * A NON-AUTHORITATIVE memory aid of foods commonly high in fructose or fructans,
 * to help when hand-labeling a new food. This is general guidance from public
 * low-FODMAP references — it is NOT a verdict about the specific food being
 * entered, and portion size matters (levels are per typical serving). Never let
 * this auto-set a level; the user always chooses. See CLAUDE.md.
 */
export interface FodmapReference {
  /** Commonly high in EXCESS fructose (fructose in excess of glucose). */
  highFructose: readonly string[]
  /** Commonly high in FRUCTANS. */
  highFructans: readonly string[]
  /** Usually low on BOTH axes at a normal serving — reassurance picks. */
  usuallyLow: readonly string[]
  /** Ingredient-label aliases that signal added EXCESS FRUCTOSE. */
  fructoseLabelNames: readonly string[]
  /** Ingredient-label aliases that signal added FRUCTANS. */
  fructansLabelNames: readonly string[]
  /**
   * Polyols / sugar alcohols — a SEPARATE FODMAP group, NOT the owner's tracked
   * fructose/fructans trigger. Listed for label-reading awareness only; they do
   * not set either tracked level.
   */
  polyolLabelNames: readonly string[]
}

export const FODMAP_REFERENCE: FodmapReference = {
  highFructose: [
    'apple',
    'pear',
    'mango',
    'watermelon',
    'cherries',
    'fig',
    'honey',
    'agave',
    'high-fructose corn syrup',
    'fruit juice',
    'dried fruit',
    'sugar-snap peas',
  ],
  highFructans: [
    'wheat (large amounts)',
    'rye',
    'barley',
    'onion',
    'garlic',
    'leek',
    'shallot',
    'spring onion (white part)',
    'artichoke',
    'asparagus',
    'inulin / chicory root',
    'nectarine',
    'white peach',
    'watermelon',
    'dried fruit',
  ],
  usuallyLow: [
    'banana (firm)',
    'blueberries',
    'strawberries',
    'raspberries',
    'kiwi',
    'orange',
    'grapes',
    'carrot',
    'spinach',
    'zucchini',
    'bell pepper',
    'green beans',
    'cucumber',
    'potato',
    'rice',
    'oats',
    'quinoa',
    'garlic-infused oil',
  ],
  fructoseLabelNames: [
    'fructose',
    'crystalline fructose',
    'high-fructose corn syrup (HFCS)',
    'agave syrup / nectar',
    'honey',
    'fruit-juice concentrate',
    'invert sugar',
  ],
  fructansLabelNames: [
    'inulin',
    'chicory root / chicory root fibre',
    'fructo-oligosaccharides (FOS)',
    'oligofructose',
    'wheat / rye / barley fibre',
  ],
  polyolLabelNames: [
    'sorbitol (E420)',
    'mannitol (E421)',
    'maltitol (E965)',
    'isomalt (E953)',
    'xylitol (E967)',
    'lactitol (E966)',
    'erythritol (E968) — usually well tolerated',
  ],
}
