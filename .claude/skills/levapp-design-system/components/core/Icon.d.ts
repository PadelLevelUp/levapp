/**
 * The only icon primitive. Outline, 24×24 grid, 2px stroke, inherits currentColor.
 *
 * @startingPoint section="Core" subtitle="Navigation and utility glyphs" viewport="700x110"
 */
export interface IconProps extends React.SVGAttributes<SVGElement> {
  /**
   * Navigation: painel | calendario | jogadores | treino | mensagens | definicoes.
   * Utility: check | back | plus | search.
   */
  name: "painel" | "calendario" | "jogadores" | "treino" | "mensagens" | "definicoes"
      | "check" | "back" | "plus" | "search";
  /** @default 20 */
  size?: number;
  /** Do not go below 2 — the app's icons are a consistent 2px outline. @default 2 */
  strokeWidth?: number;
}

export declare function Icon(props: IconProps): JSX.Element;
