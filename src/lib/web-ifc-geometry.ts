export function extractWebIfcPositions(rawVertexData: Float32Array | number[]): Float32Array {
  if (rawVertexData.length === 0) {
    return new Float32Array();
  }

  // web-ifc geometry buffers are interleaved as xyz + normal xyz.
  if (rawVertexData.length % 6 === 0) {
    const vertexCount = rawVertexData.length / 6;
    const positions = new Float32Array(vertexCount * 3);

    for (let sourceIndex = 0, targetIndex = 0; sourceIndex < rawVertexData.length; sourceIndex += 6) {
      positions[targetIndex++] = rawVertexData[sourceIndex]!;
      positions[targetIndex++] = rawVertexData[sourceIndex + 1]!;
      positions[targetIndex++] = rawVertexData[sourceIndex + 2]!;
    }

    return positions;
  }

  return rawVertexData instanceof Float32Array
    ? rawVertexData
    : new Float32Array(rawVertexData);
}