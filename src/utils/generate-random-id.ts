// The map of created ids only grows over time, but, since I know that the server instance
// is shutdown when not in used for 30 minutes, this map cannot grow too much.
const createdIds = {}

export function generateRoomId() {
  const roomId = Math.random().toString(36).substr(2, 6);
  if (!createdIds[roomId]) {
    createdIds[roomId] = true;
    return roomId;
  }
  return this.generateRoomId();
}
