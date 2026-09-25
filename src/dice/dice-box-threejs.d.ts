// La librería no trae tipos: sólo lo que usamos.
declare module '@3d-dice/dice-box-threejs' {
  export type ColorSet = { name: string; foreground: string; background: string; outline: string; texture: string; material: string }
  export default class DiceBox {
    constructor(selector: string, config?: Record<string, unknown>)
    sounds: boolean
    volume: number
    initialize(): Promise<void>
    updateConfig(config: { theme_customColorset?: ColorSet }): Promise<void>
    /** Notación "2d6+1d20@3,5,17": después de la @ van los valores donde caen los dados, en orden. */
    roll(notation: string): Promise<unknown>
    clearDice(): void
  }
}
