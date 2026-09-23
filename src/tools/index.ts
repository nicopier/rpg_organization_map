import type { Tool } from '../state/mapStore'
import { eraseTool } from './erase'
import { fogTool } from './fog'
import { measureTool } from './measure'
import { paintFloorTool } from './paintFloor'
import { partyDropTool } from './partyDrop'
import { placeItemTool, placeTokenTool } from './placeItem'
import { roomTool } from './room'
import { selectTool } from './select'
import type { ToolHandler } from './types'
import { wallTool } from './wall'

const TOOLS: Record<Tool, ToolHandler> = {
  select: selectTool,
  // La Mano la maneja la escena directamente: mover la vista no es una edición.
  pan: {},
  paint: paintFloorTool,
  room: roomTool,
  place: placeItemTool,
  token: placeTokenTool,
  wall: wallTool,
  erase: eraseTool,
  measure: measureTool,
  fog: fogTool,
  partyDrop: partyDropTool,
}

export function getTool(t: Tool): ToolHandler {
  return TOOLS[t]
}

export type { Pointer, ToolHandler } from './types'
