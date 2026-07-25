import {
  getAllRecords,
  getRecord,
  putRecord,
  replaceAllRecords,
  SCENES_STORE,
} from './idb'
import type { Scene } from '@/scenes/sceneList'

export type { Scene }

export async function saveScene(scene: Scene): Promise<void> {
  await putRecord(SCENES_STORE, scene)
}

export async function getScene(id: string): Promise<Scene | undefined> {
  return getRecord<Scene>(SCENES_STORE, id)
}

export async function getAllScenes(): Promise<Scene[]> {
  return getAllRecords<Scene>(SCENES_STORE)
}

/** The stored library becomes exactly `scenes`; anything else is dropped. */
export async function replaceAllScenes(scenes: Scene[]): Promise<void> {
  await replaceAllRecords(SCENES_STORE, scenes)
}
