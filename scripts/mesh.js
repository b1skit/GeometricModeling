// mesh object: Geometry contained by a renderObject

// CMPT 764 Assignment 1
// by Adam Badke
// SFU Student #301310785
// abadke@sfu.ca



/*  Face class
*
*/
class face
{
	// Vertex attributes for the current face:
	_normals 		= [];
	_uvs			= [];

	_faceNormal		= null;

    // Winged-edge adjacency references:
    _edge   = null;

    constructor()
    {

    }

	
	// Compute the face normal for this face. Call this once the face is otherwise fully initialized
	computeFaceNormal(hasNormal)
	{
		var v1 = vec3.create();				
		vec3.subtract(v1, this._edge._vertOrigin._position, this._edge._vertDest._position);
		vec3.normalize(v1, v1);

		var v2 = vec3.create();				
		vec3.subtract(v2, this._edge._edgeLeftCCW._vertDest._position, this._edge._vertDest._position);
		vec3.normalize(v2, v2);

		this._faceNormal = vec3.create();
		vec3.cross(this._faceNormal, v2, v1);
		vec3.normalize(this._faceNormal, this._faceNormal);

		// If no normals were received in the source OBJ, use the face normal instead:
		if (!hasNormal)
		{
			this._normals.push(this._faceNormal);	// We push it 3 times (once for each vertex)
			this._normals.push(this._faceNormal);
			this._normals.push(this._faceNormal);
		}
		
	}
}


/*  Vertex class
*
*/
class vertex
{
    // Vertex properties:
    _position   	= null;
	
	// Smoothed normals:
	_smoothedNormal = null;
	_adjacentFaces 	= 0;	// Used to average the neighboring face normals

    // Winged-edge adjacency references:
    _edge       = null;
	_vertIndex 	= -1;	// The index of the mesh._vertices array that this vertex is stored in. Used for efficient OBJ output

	constructor(px, py, pz, vertIndex)
    {
        // Position:
        this._position      	= vec3.fromValues(px, py, pz);

		this._smoothedNormal 	= vec3.fromValues(0.0, 0.0, 0.0);

		this._vertIndex 		= vertIndex;
    }


	// Compare this vertex against another.
	// Returns true if they share the same position, false otherwise.
	equals(otherVert)
	{
		// For adjacency purposes, we only care if vertex positions are the same
		return vec3.equals(this._position, otherVert._position);
	}
}


/*  Edge class
*
*/
class edge
{
    // Winged-edge adjacency references:
    _vertOrigin     = null;
    _vertDest       = null;

    _faceLeft       = null;
    _faceRight      = null;

	_edgeLeftCCW    = null;	// The "next" edge in CCW order
    _edgeLeftCW     = null;	// The "previous" edge in CCW order
    

	_children		= null;	// For subdivision


    constructor(vertOrigin, vertDest)
    {
		this._vertOrigin 	= vertOrigin;
		this._vertDest 		= vertDest;

		// Update the vertex -> edge pointer:
		if (this._vertOrigin._edge == null)
		{
			this._vertOrigin._edge = this;	
		}
    }

	
	// Check if 2 edge objects are defined by the same 2 vertices
	equals(otherEdge)
	{
		return (
			(this._vertOrigin.equals(otherEdge._vertOrigin) && this._vertDest.equals(otherEdge._vertDest)) ||
			(this._vertOrigin.equals(otherEdge._vertDest) 	&& this._vertDest.equals(otherEdge._vertOrigin))
		);
	}
}


/*  MESH CLASS
*
*/
class mesh
{
    _material       			= new material();

    // WebGL identifiers:
    _positionsBuffer       		= null;     // Vertex positions: Allocated when initializeBuffers() is called
    _positionData          		= [];

	_wireframePositionsBuffer 	= null;
	_wireframePositionsData 	= [];

    _OBJNormalsBuffer			= null;     // OBJ Vertex normals
    _OBJNormalsData				= [];
	
	_smoothNormalsBuffer		= null;     // "Smoothed" vertex normals, found by averaging neighboring vertices
    _smoothNormalsData			= [];
	
    _colorBuffer            	= null;     // Vertex colors
    _colorData        			= [];
	
	_shadingMode 				= SHADING_MODE.SHADED_WIREFRAME;

    // Winged-edge structure:
    _faces      = null;
    _edges      = null;
    _vertices   = null;

	_vertexDegree 			= [];
	_vertexDegreeIsDirty 	= true;

    constructor()
    {

    }


	getInverseEdge(currentEdge)
	{
		return this._edges[currentEdge._vertDest._vertIndex][currentEdge._vertOrigin._vertIndex];
	}


	// Subdivision helper: Get the number of edges connected to a vertex
	getVertexDegree(vertexIndex)
	{
		if (this._vertexDegreeIsDirty == true)
		{
			this._vertexDegree = [];

			for (var currentRow = 0; currentRow < this._edges[0].length; currentRow++)
			{
				var currentCount = 0;
				for (var currentCol = 0; currentCol < this._edges[0].length; currentCol++)
				{
					if (this._edges[currentRow][currentCol] != null)	//  Note: _edges[currentRow][currentCol] == null
					{
						currentCount++;
					}
				}
				this._vertexDegree.push(currentCount);
			}

			this._vertexDegreeIsDirty = false;
		}

		return this._vertexDegree[vertexIndex];
	}


	// Subdivision helper: Get a list of references to vertex neighbors connected to a vertex with a specific index
	getVertexNeighbors(vertexIndex)
	{
		var neighbors = [];

		for (var currentVert = 0; currentVert < this._edges[0].length; currentVert++)
		{
			if (this._edges[vertexIndex][currentVert] != null)
			{
				// Handle bi-directional edges: Only push neighbors, not the target vertex:
				if(this._edges[vertexIndex][currentVert]._vertOrigin._vertIndex == vertexIndex)
				{
					neighbors.push(this._edges[vertexIndex][currentVert]._vertDest);
				}
				else
				{
					neighbors.push(this._edges[vertexIndex][currentVert]._vertOrigin);
				}
			}
		}
		
		return neighbors;
	}


	// Set the shading mode:
	setActiveShadingMode(shadingMode)
	{
		this._shadingMode = shadingMode;
	}


	// Inserts a vertex if it has not been seen before, and returns the vertex at candidateVertex._vertIndex
	addVertexIfUnique(candidateVertex)
	{
		if (this._vertices[candidateVertex._vertIndex] == null)
		{
			this._vertices[candidateVertex._vertIndex] = candidateVertex;

			this._vertexDegreeIsDirty = true;	// We only use this later during subdivison, but setting the flag here as a precaution
		}

		return this._vertices[candidateVertex._vertIndex];
	}


	// Inserts an edge (and its inverse) if it has not been seet before. Returns the inserted/existing edge with the same orientation as the received candidate edge:
	addEdgeIfUnique(candidateEdge)
	{
		var originVertIndex = candidateEdge._vertOrigin._vertIndex;
		var destVertIndex 	= candidateEdge._vertDest._vertIndex;

		// If the edge doesn't exist, add it and its inverse to the edges table:
		if(this._edges[originVertIndex][destVertIndex] == null)
		{
			this._edges[originVertIndex][destVertIndex] = candidateEdge;

			var inverseEdge = new edge(candidateEdge._vertDest, candidateEdge._vertOrigin);

			this._edges[destVertIndex][originVertIndex] = inverseEdge;
		}

		return this._edges[originVertIndex][destVertIndex];
	}

    // Load data received from an .obj file into our mesh:
    constructMeshFromOBJData(objData)
    {
        console.log("[renderObjects::mesh::constructMeshFromOBJData] Constructing mesh from obj data...");

        // Extracted geometry:
        var extractedVerts      = [];
        var extractedUVs        = [];
        var extractedNormals    = [];
        var extractedFaces      = [];

        // Split the obj per line:
        var objLines = objData.split('\n');
        
		// Process the OBJ, line-by-line:
        for(var i = 0; i < objLines.length; i++)
        {
            // Trim whitespace to ensure single-spacing:
            objLines[i] = objLines[i].replace(/\s+/g, ' ').trim();

            // Split on spaces:
            var lineParts = objLines[i].split(' ');

            // Skip irrelevant lines:
            if (
                lineParts[0].includes('#')  ||  // Comments
                (lineParts[0].length > 2 )  ||  // Looking for v, vt, vn, f only
                (!lineParts[0].includes('v') && !(lineParts[0] === 'f'))
            )
            {
                continue;
            }

			var nonStandardOBJ = false;

            // Process the current line:
            switch(lineParts[0])
            {
                // Vertices:
                case "v":
                {
                    if (lineParts.length != 4)
                    {
						nonStandardOBJ = true;
                    }
                    
                    // Convert each value to a float and push it to our vertex list:
                    var vertXYZ = [];
                    for (var currentLinePart = 1; currentLinePart < 4; currentLinePart++)
                    {
                        vertXYZ.push( parseFloat(lineParts[currentLinePart]) );
                    }
                    extractedVerts.push( vertXYZ );	// vertXYZ = [x, y, z]
                }
                break;

                // Texture coords:
                case "vt":
                {
                    if (lineParts.length != 3 && lineParts.length != 4)
                    {
                        nonStandardOBJ = true;
                    }
                    
                    // Convert each value to a float and push it to our vertex list:
                    var UV = [];
                    for (var currentLinePart = 1; currentLinePart < 3; currentLinePart++)
                    {
                        UV.push( parseFloat(lineParts[currentLinePart]) );
                    }
                    extractedUVs.push( UV );
                }
                break;

                // Normals:
                case "vn":
                {
                    if (lineParts.length != 4)
                    {
                        nonStandardOBJ = true;
                    }
                    
                    // Convert each value to a float and push it to our vertex list:
                    var normalXYZ = [];
                    for (var currentLinePart = 1; currentLinePart < 4; currentLinePart++)
                    {
                        normalXYZ.push( parseFloat(lineParts[currentLinePart]) );
                    }
                    extractedNormals.push( normalXYZ );
                }
                break;

                // Faces:
                case "f":
                {
                    if (lineParts.length != 4)
                    {
                        nonStandardOBJ = true;
                    }

                    // Determine which of the possible face encodings we're reading:
                    // v v v,                       Positions only              1
                    // v/vt, v/vt, v/vt             Positions + UVs             2
                    // v/vt/vn, v/vt/vn, v/vt/vn    Positions, UVs, Normals     3
                    // v//vn, v//vn, v//vn          Positions + Normals         3
                    var numEntries = lineParts[1].split('/').length;

                    var faceEntry = []; // We'll populate this with the current face data:  [ [1x3], [1x3], [1x3] ]
                    
                    // Faces are sets of indexes into the vertex position, uv, and normal arrays.
                    // Convert each index to a int and push it to the appropriate list:
                    for (var currentLinePart = 1; currentLinePart < 4; currentLinePart++)
                    {
                        // Split the current entry:
                        var extractedIndexes = lineParts[currentLinePart].split('/');

                        // Insert the indexes.
                        // NOTE: -1 == null entry. We subtract -1 from each index, as .OBJ indexes are 1-based
                        switch(numEntries)
                        {
                            case 1: // v v v
                            {
                                faceEntry.push( [parseInt(extractedIndexes[0]) - 1, -1, -1] ); 
                            }
                            break;

                            case 2: // v/vt, v/vt, v/vt 
                            {
                                faceEntry.push( [parseInt(extractedIndexes[0]) - 1, parseInt(extractedIndexes[1]) - 1, -1] );
                            }
                            break;

                            case 3: // v/vt/vn, v/vt/vn, v/vt/vn  -OR-  v//vn, v//vn, v//vn 
                            {
                                if (extractedIndexes[1] === "")
                                {
                                    // v//vn, v//vn, v//vn 
                                    faceEntry.push( [parseInt(extractedIndexes[0]) - 1, -1, parseInt(extractedIndexes[2]) - 1] );
                                }
                                else                            
                                {
                                    // v/vt/vn, v/vt/vn, v/vt/vn
                                    faceEntry.push( [ parseInt(extractedIndexes[0]) - 1, parseInt(extractedIndexes[1]) - 1, parseInt(extractedIndexes[2]) - 1 ] );
                                }                                    
                            }
                            break;

                            default:
								{
									console.log("[mesh::constructMeshFromOBJData] Error: Non-standard face found while parsing obj: \"" + objLines[i] + "\"");
									nonStandardOBJ = true;
								}
                        }
                    }

                    // Finally, push the [ [1x3], [1x3], [1x3] ] to our extracted faces list:
                    extractedFaces.push(faceEntry);
                }
                break;

                default:
                    console.log("[mesh::constructMeshFromOBJData] Skipping non-geometry descriptor while parsing obj: \"" + objLines[i] + "\"");
            }   // end switch
            
        } // end objLines loop

		if (nonStandardOBJ)
		{
			alert("[mesh::constructMeshFromOBJData] Warning: Non-standard .OBJ detected... Results may be unexpected!");
		}	   
     
		// (Re)Initialize our winged-edge structures:
        this._vertices 	= [];
		for (var currentVert = 0; currentVert < extractedVerts.length; currentVert++)
		{
			this._vertices.push(null);	// Pre-allocate the vertices array
		}
		// 2D edge table:
		this._edges 	= [];
		for (var currentRow = 0; currentRow < extractedVerts.length; currentRow++)
		{
			this._edges.push(new Array());
			for (var currentCol = 0; currentCol < extractedVerts.length; currentCol++)
			{
				this._edges[currentRow].push(null);
			}
		}

		this._faces 	= [];

		// Construct our winged data structure using the extracted face indexes:
        for (var currentFace = 0; currentFace < extractedFaces.length; currentFace++)
        {
			// Construct the current face:
			var newFace 	= new face();

			// Construct the vertices:
			var newFaceVerts 	= [];
			var hasNormal 		= false;
			for (var currentVertex = 0; currentVertex < 3; currentVertex++)
			{
				// Indexing:
				// extractedFaces[currentFace][ [v, vt, vn], [v, vt, vn], [v, vt, vn] ]
        		// extractedFaces[currentFace][ 0:[0, 1, 2], 1:[0, 1, 2], 2:[0, 1, 2] ]

				// Assemble vert position:
				const vertIndex = extractedFaces[currentFace][currentVertex][0];
                const px = extractedVerts[ vertIndex ][0];	// extractedVerts[] = [x, y, z]
                const py = extractedVerts[ vertIndex ][1];
                const pz = extractedVerts[ vertIndex ][2];

				// Construct the vertex:
				var candidateVertex = new vertex(px, py, pz, vertIndex);

				newFaceVerts[currentVertex] = this.addVertexIfUnique(candidateVertex);

                // Assemble UVs:
                var u, v = 0;
                var hasUVs = extractedFaces[currentFace][0][1] != -1;   // Check first vertex in the face
                if(hasUVs)
                {
                    u = extractedUVs[ extractedFaces[currentFace][currentVertex][1] ][0];
                    v = extractedUVs[ extractedFaces[currentFace][currentVertex][1] ][1];
                }
				// Add the UVs to the face:
				newFace._uvs.push( vec2.fromValues(u, v) );

                // Assemble normal:
                var nx, ny, nz = 0;
                hasNormal = extractedFaces[currentFace][0][2] != -1;    // Check first vertex in the face
                if (hasNormal)
                {
                    nx = extractedNormals[ extractedFaces[currentFace][currentVertex][2] ][0];
                    ny = extractedNormals[ extractedFaces[currentFace][currentVertex][2] ][1];
                    nz = extractedNormals[ extractedFaces[currentFace][currentVertex][2] ][2];

					// Add the normals to the face:
					newFace._normals.push( vec3.fromValues(nx, ny, nz) );
                }
			} // end vertex construction

			var newFaceEdges = [
				new edge(newFaceVerts[0], newFaceVerts[1]),
				new edge(newFaceVerts[1], newFaceVerts[2]),
				new edge(newFaceVerts[2], newFaceVerts[0]),
			];	// NOTE: Edge construction sets the origin vertex -> edge pointer, if it's not already set

			// Update the edges table:
			for (var currentEdge = 0; currentEdge < 3; currentEdge++)
			{
				newFaceEdges[currentEdge] = this.addEdgeIfUnique(newFaceEdges[currentEdge]);
			}

			// Update the pointers:
			for (var currentEdge = 0; currentEdge < newFaceEdges.length; currentEdge++)
			{
				// NOTE: Edge construction already set the origin vertex -> edge pointers

				var originVertIndex = newFaceEdges[currentEdge]._vertOrigin._vertIndex;
				var destVertIndex 	= newFaceEdges[currentEdge]._vertDest._vertIndex;

				var inverseEdge 	= this._edges[destVertIndex][originVertIndex];

				// Update pointers for the current face and its edges:
				newFaceEdges[currentEdge]._faceLeft = newFace;
				inverseEdge._faceRight 				= newFace;

				if (inverseEdge._faceLeft != null)
				{
					newFaceEdges[currentEdge]._faceRight = inverseEdge._faceLeft;
				}

				// Update edge pointers:
				var nextEdgeIndex	= (currentEdge + 1) % 3;
				var prevEdgeIndex	= currentEdge == 0 ? 2 : ((currentEdge - 1) % 3);

				// Current edge: CW, CCW:
				newFaceEdges[currentEdge]._edgeLeftCCW 	= newFaceEdges[nextEdgeIndex];
				newFaceEdges[currentEdge]._edgeLeftCW 	= newFaceEdges[prevEdgeIndex];
			}

			// Now that we have our final edges, update the face -> edge pointer
			newFace._edge 	= newFaceEdges[0];

			// Now that we've set the edges, compute the face normal:
			newFace.computeFaceNormal(hasNormal);
			
			this._faces.push(newFace);			

        }	// end face parsing

		// Compute the smooth normals:
		this.computeSmoothNormals();

		console.log("[mesh::constructMeshFromOBJData] Extracted " + this._vertices.length + " vertices, " + (this._faces.length * 3) + " (bi-directional) edges, " + this._faces.length + " faces to the winged data structure");

        // Finally, initialize the render object mesh's vertex buffers:
        this.initializeBuffers();
    }


	// Compute smooth/averaged normals for a loaded mesh:
	computeSmoothNormals()
	{
		// Sum the neighboring face normals:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			var startEdge 	= this._faces[currentFace]._edge;
			var currentEdge = this._faces[currentFace]._edge;
			do
			{
				vec3.add(currentEdge._vertOrigin._smoothedNormal, currentEdge._vertOrigin._smoothedNormal, currentEdge._faceLeft._faceNormal);
				currentEdge._vertOrigin._adjacentFaces++;

				currentEdge = currentEdge._edgeLeftCCW;

			} while (currentEdge != startEdge);
		}

		// Average the results:
		for (var currentVert = 0; currentVert < this._vertices.length; currentVert++)
		{
			if (this._vertices[currentVert._adjacentFaces > 0])
			{
				var denominator = vec3.fromValues(this._vertices[currentVert]._adjacentFaces, this._vertices[currentVert]._adjacentFaces, this._vertices[currentVert]._adjacentFaces);
				vec3.divide(this._vertices[currentVert]._smoothedNormal, this._vertices[currentVert]._smoothedNormal, denominator);

				vec3.normalize(this._vertices[currentVert]._smoothedNormal, this._vertices[currentVert]._smoothedNormal);
			}
		}
	}


	// Is a valid mesh loaded and ready to render?
	isInitialized()
	{
		return this._positionsBuffer != null;
	}


	// Helper function: Calls the appropriate subdivision function
	subdivideMesh(subdivisionType, numberOfLevels)
	{
		if(!this.isInitialized())
		{
			console.log("[mesh][subdivideMesh] Must load a mesh before subdivision can be performed");
			return;
		}

		if (subdivisionType < SUBDIVISION_TYPE.LOOP || subdivisionType > SUBDIVISION_TYPE.BUTTERFLY)
		{
			console.log("[mesh][subdivideMesh] Invalid subdivision type received! Aborting");
			return;
		}

		// Perform the required number of iterations:
		for (var currentIteration = 0; currentIteration < numberOfLevels; currentIteration++)
		{
			console.log(numberOfLevels);
			this.doSubdivideMesh(subdivisionType);
		}
	}


	// Subdivide this mesh:
	doSubdivideMesh(subdivisionMode)
	{
		this._vertexDegreeIsDirty = true;	// Mark the vertex degree count as dirty to ensure we recalculate the degrees

		// Count the number of edges in the current mesh:
		var totalEdges = 0;
		for (var currentRow = 0; currentRow < this._edges[0].length; currentRow++)
		{
			for (var currentCol = 0; currentCol < this._edges[0].length; currentCol++)
			{
				if (this._edges[currentRow][currentCol] != null)
				{
					totalEdges++;
				}
			}
		}
		totalEdges /= 2; // Edges are bi-directional, so we must halve the count

		// Calculate the number of vertices in the subdivided mesh:
		var newTotalVerts = this._vertices.length + totalEdges;

		// Create new winged-edge structures:
		var newVerts = [];
		for (var currentVert = 0; currentVert < newTotalVerts; currentVert++)
		{
			newVerts.push(null);
		}

		// 2D edge table:
		var newEdges = [];
		for (var currentRow = 0; currentRow < newTotalVerts; currentRow++)
		{
			newEdges.push(new Array());
			for (var currentCol = 0; currentCol < newTotalVerts; currentCol++)
			{
				newEdges[currentRow].push(null);
			}
		}

		var newFaces = [];

		// Add transformed copies of original verts to the new table:
		for (var currentVert = 0; currentVert < this._vertices.length; currentVert++)
		{
			if (subdivisionMode == SUBDIVISION_TYPE.LOOP)
			{
				var currentDegree = this.getVertexDegree(currentVert);

				if (currentDegree < 3)
				{
					console.log("[mesh][subdivideMesh] ERROR: Found a vertex with degree < 3");
					return;
				}
	
				var beta 			= (1.0 / currentDegree) * (FIVE_OVER_EIGHT - Math.pow(THREE_OVER_EIGHT + ONE_OVER_FOUR * Math.cos(TWO_PI / currentDegree), 2));
				var oneMinusNBeta 	=  1.0 - (currentDegree * beta);
	
				// Get neighbors of the current vert:
				var neighborVerts = this.getVertexNeighbors(currentVert);
	
				// Apply the vertex rule at each neighbors:
				var sumPositions = vec3.create();
				for (var currentNeighbor = 0; currentNeighbor < neighborVerts.length; currentNeighbor++)
				{
					vec3.add(sumPositions, sumPositions, neighborVerts[currentNeighbor]._position);
				}
				vec3.scale(sumPositions, sumPositions, beta);
	
				// Apply the vertex rule at the current vertex:
				var scaledCurrentPosition = vec3.create();
				vec3.scale(scaledCurrentPosition, this._vertices[currentVert]._position, oneMinusNBeta);
	
				// Combine the weighted neighbor and current vertex positions:
				vec3.add(scaledCurrentPosition, scaledCurrentPosition, sumPositions);
	
				var replacementVert = new vertex(
					scaledCurrentPosition[0],
					scaledCurrentPosition[1],
					scaledCurrentPosition[2],
					this._vertices[currentVert]._vertIndex
				);
	
				// Finally, add the replacement vert to our new vertex array:
				newVerts[currentVert] = replacementVert;
			}
			else if (subdivisionMode == SUBDIVISION_TYPE.BUTTERFLY)
			{
				// Butterfly is interpolating: We just copy the verts as-is:

				var replacementVert = new vertex(
					this._vertices[currentVert]._position[0],
					this._vertices[currentVert]._position[1],
					this._vertices[currentVert]._position[2],
					this._vertices[currentVert]._vertIndex
				);

				// Finally, add the copied vert to our new vertex array:
				newVerts[currentVert] = replacementVert;
			}
		}
		
		// Track which first empty index of the new vertex table we're inserting into
		var nextNewVertIndex = this._vertices.length;	

		// Subdivide existing edges of each face:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			// Traverse the edges of the face:
			var startEdge 	= this._faces[currentFace]._edge;
			var currentEdge = startEdge;
			do
			{
				// Skip edges that have already been processed when handling another face:
				if (currentEdge._children != null)
				{
					// Prepare for the next iteration:
					currentEdge = currentEdge._edgeLeftCCW;
					continue;
				}

				var newVertPosition = vec3.create();

				if (subdivisionMode == SUBDIVISION_TYPE.LOOP)
				{
					// Apply the edge rule to the start/end verts:
					var scaledStartEndPositions = vec3.create();
					vec3.add(scaledStartEndPositions, currentEdge._vertOrigin._position, currentEdge._vertDest._position);
					vec3.scale(scaledStartEndPositions, scaledStartEndPositions, THREE_OVER_EIGHT);

					// Apply the edge rule to the "side" verts:
					var scaledSideVerts = vec3.create();
					var inverseEdge = this.getInverseEdge(currentEdge);
					vec3.add(scaledSideVerts, currentEdge._edgeLeftCCW._vertDest._position, inverseEdge._edgeLeftCCW._vertDest._position);
					vec3.scale(scaledSideVerts, scaledSideVerts, ONE_OVER_EIGHT);

					vec3.add(newVertPosition, scaledStartEndPositions, scaledSideVerts);
				}
				else if (subdivisionMode == SUBDIVISION_TYPE.BUTTERFLY)
				{
					var currentOriginDegree = this.getVertexDegree(currentEdge._vertOrigin._vertIndex);
					var currentDestDegree 	= this.getVertexDegree(currentEdge._vertDest._vertIndex);

					// Handle regular verts:
					if (currentOriginDegree == 6 && currentDestDegree == 6)
					{
						// Start/edge verts:
						vec3.add(newVertPosition, currentEdge._vertOrigin._position, currentEdge._vertDest._position);
						vec3.scale(newVertPosition, newVertPosition, ONE_OVER_TWO);

						var inverseEdge = this.getInverseEdge(currentEdge);

						// "Side" verts:
						var scaledSideVerts = vec3.create();
						vec3.add(scaledSideVerts, currentEdge._edgeLeftCCW._vertDest._position, inverseEdge._edgeLeftCCW._vertDest._position);
						vec3.scale(scaledSideVerts, scaledSideVerts, ONE_OVER_EIGHT);

						vec3.add(newVertPosition, newVertPosition, scaledSideVerts);

						// Diagonal verts:
						var scaledDiagonalVerts = vec3.create();

						// Top right:
						vec3.add(scaledDiagonalVerts, scaledDiagonalVerts, this.getInverseEdge(currentEdge._edgeLeftCCW)._edgeLeftCCW._vertDest._position);

						// Top left:
						vec3.add(scaledDiagonalVerts, scaledDiagonalVerts, this.getInverseEdge(currentEdge._edgeLeftCCW._edgeLeftCCW)._edgeLeftCCW._vertDest._position);

						// Bottom left:
						vec3.add(scaledDiagonalVerts, scaledDiagonalVerts, this.getInverseEdge( this.getInverseEdge(currentEdge)._edgeLeftCCW )._edgeLeftCCW._vertDest._position);

						// Bottom right:
						vec3.add(scaledDiagonalVerts, scaledDiagonalVerts, this.getInverseEdge( this.getInverseEdge(currentEdge)._edgeLeftCCW._edgeLeftCCW )._edgeLeftCCW._vertDest._position);
						vec3.scale(scaledDiagonalVerts, scaledDiagonalVerts, NEG_ONE_OVER_SIXTEEN);

						vec3.add(newVertPosition, newVertPosition, scaledDiagonalVerts);
					
					}
					else if (currentOriginDegree != 6 && currentDestDegree != 6)
					{
						// Handle irregular verts at both ends: Take the average of applying the rules to both endpoints:

						var neighbors 	= this.getVertexNeighbors(currentEdge._vertDest._vertIndex);
						var result1		= this.getButterflyWeightedVertex(neighbors, currentEdge._vertOrigin, currentEdge._vertDest);

						neighbors 		= this.getVertexNeighbors(currentEdge._vertOrigin._vertIndex);
						var result2 	= this.getButterflyWeightedVertex(neighbors, currentEdge._vertDest, currentEdge._vertOrigin);
						
						// Average the result:
						vec3.add(newVertPosition, result1, result2);
						vec3.scale(newVertPosition, newVertPosition, 0.5);

					}
					else // Handle edges with 1 regular vert:
					{
						var theRegularVert;
						var theIrregularVert;

						var neighbors;
						if (currentOriginDegree == 6)
						{
							neighbors = this.getVertexNeighbors(currentEdge._vertDest._vertIndex);

							theRegularVert 		= currentEdge._vertOrigin;
							theIrregularVert 	= currentEdge._vertDest;
						}
						else //currentDestDegree == 6
						{
							neighbors = this.getVertexNeighbors(currentEdge._vertOrigin._vertIndex);

							theRegularVert 		= currentEdge._vertDest;
							theIrregularVert 	= currentEdge._vertOrigin;
						}

						newVertPosition = this.getButterflyWeightedVertex(neighbors, theRegularVert, theIrregularVert);
					}			
				}

				// Construct the new vertex:
				var newVert = new vertex(
					newVertPosition[0],
					newVertPosition[1],
					newVertPosition[2],
					nextNewVertIndex
				);

				// Add the new vertex to the new vertex array:
				newVerts[nextNewVertIndex] = newVert;		
				
				nextNewVertIndex++; // Increment for the next vertex we'll add

				// Construct the new sub-edges, and add them to the new edges list:
				var edge1 = new edge(
					newVerts[currentEdge._vertOrigin._vertIndex], 
					newVert
					);
				newEdges[currentEdge._vertOrigin._vertIndex][newVert._vertIndex] = edge1;

				var edge1Inverse = new edge(
					newVert,
					newVerts[currentEdge._vertOrigin._vertIndex]
					);
				newEdges[newVert._vertIndex][currentEdge._vertOrigin._vertIndex] = edge1Inverse;

				var edge2 = new edge(
					newVert,
					newVerts[currentEdge._vertDest._vertIndex]					
					);
				newEdges[newVert._vertIndex][currentEdge._vertDest._vertIndex] = edge2;

				var edge2Inverse = new edge(
					newVerts[currentEdge._vertDest._vertIndex],
					newVert					
					);
				newEdges[currentEdge._vertDest._vertIndex][newVert._vertIndex] = edge2Inverse;

				// Update new vertex's vert -> edge pointer:
				newVert._edge = edge2;	// Origin vertex of edge2

				// Get a pointer to the inverse of the current edge:
				var inverseCurrentEdge = this._edges[currentEdge._vertDest._vertIndex][currentEdge._vertOrigin._vertIndex];
				
				// Add pointers to the child edges (in CCW order) so we can find them later:
				currentEdge._children 			= [edge1, edge2];
				inverseCurrentEdge._children 	= [edge2Inverse, edge1Inverse];
				
				// Prepare for the next iteration:
				currentEdge = currentEdge._edgeLeftCCW;
			} while (currentEdge != startEdge);
		}

		// Connect the new sub-edges to create new sub-triangle faces:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			// Cache the internal edges so we can construct the inner sub-triangle:
			var createdEdges 		= [];
			var createdInverseEdges = [];

			// Traverse the edges of the face:
			var startEdge 	= this._faces[currentFace]._edge;
			var currentEdge = startEdge;
			do
			{
				// Create corner triangle for the current face:
				var prevEdge 		= currentEdge._edgeLeftCW;
				var prevNewVert 	= prevEdge._children[1]._vertOrigin;

				var currentNewVert 	= currentEdge._children[0]._vertDest;

				var newFace 	= new face();
				newFace._edge 	= currentEdge._children[0];
				newFaces.push(newFace);

				// Create the internal connecting edge and its inverse, and add them to the edge table:
				var newEdge = new edge(
					currentNewVert,
					prevNewVert
				);
				newEdges[currentNewVert._vertIndex][prevNewVert._vertIndex] = newEdge;

				var inverseNewEdge = new edge(
					prevNewVert,
					currentNewVert					
				);
				newEdges[prevNewVert._vertIndex][currentNewVert._vertIndex] = inverseNewEdge;

				// Cache the pointers to the new edges so we can create the internal face later:
				createdEdges.push(newEdge);
				createdInverseEdges.push(inverseNewEdge);

				// Link the left face edge pointers:
				prevEdge._children[1]._edgeLeftCCW 		= currentEdge._children[0];	// next/prev w.r.t CCW
				currentEdge._children[0]._edgeLeftCCW 	= newEdge;
				newEdge._edgeLeftCCW 					= prevEdge._children[1];

				prevEdge._children[1]._edgeLeftCW 		= newEdge;
				currentEdge._children[0]._edgeLeftCW 	= prevEdge._children[1];
				newEdge._edgeLeftCW 					= currentEdge._children[0];

				// Link the left face pointers:
				prevEdge._children[1]._faceLeft 	= newFace;
				newEdge._faceLeft 					= newFace;
				currentEdge._children[0]._faceLeft 	= newFace;

				// Update the inverse edge face pointers
				newEdges[currentEdge._vertOrigin._vertIndex][prevNewVert._vertIndex]._faceRight = newFace;
				prevEdge._children[1]._faceRight = newEdges[currentEdge._vertOrigin._vertIndex][prevNewVert._vertIndex]._faceLeft;

				newEdges[currentNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._faceRight = newFace;
				currentEdge._children[0]._faceRight = newEdges[currentNewVert._vertIndex][currentEdge._vertOrigin._vertIndex]._faceLeft;

				// Compute the face normal:
				newFace.computeFaceNormal(false);

				// TODO: Compute and upload valid UVs. For now, we just duplicate the parent face
				newFace._uvs 		= this._faces[currentFace]._uvs;

				// Prepare for the next iteration:
				currentEdge = currentEdge._edgeLeftCCW;
			} while (currentEdge != startEdge);

			// Create the inner face:
			var newFace 	= new face();
			newFace._edge 	= createdInverseEdges[0];
		
			// Update the pointers for the new face:
			for (var currentEdge = 0; currentEdge < createdInverseEdges.length; currentEdge++)
			{
				createdEdges[currentEdge]._faceRight 		= newFace;
				createdInverseEdges[currentEdge]._faceLeft 	= newFace;

				var nextEdgeIndex	= (currentEdge + 1) % 3;	// next/prev w.r.t CCW
				var prevEdgeIndex	= currentEdge == 0 ? 2 : ((currentEdge - 1) % 3);

				createdInverseEdges[currentEdge]._edgeLeftCCW 	= createdInverseEdges[nextEdgeIndex];
				createdInverseEdges[currentEdge]._edgeLeftCW 	= createdInverseEdges[prevEdgeIndex];
			}

			// Compute the face normal:
			newFace.computeFaceNormal(false);

			// TODO: Compute and upload valid UVs. For now, we just duplicate the parent face
			newFace._uvs 		= this._faces[currentFace]._uvs;

			// Finally, store the inner face:
			newFaces.push(newFace);

		} // end faces loop

		// Store the results:
		this._faces 	= newFaces;
		this._edges 	= newEdges;
		this._vertices 	= newVerts;

		// Compute smooth normals:
		this.computeSmoothNormals();

		// Finally, re-initialize the render object mesh's vertex buffers:
        this.initializeBuffers();
	}


	// Butterfly subdivision helper: Get a blended vertex positon
	getButterflyWeightedVertex(neighbors, theRegularVert, theIrregularVert)
	{
		var newVertPosition = vec3.create();

		if (neighbors.length == 3) // K = 3:
		{
			// S0:
			vec3.scale(newVertPosition, theRegularVert._position, FIVE_OVER_TWELVE);

			// S1,2:
			var weightedNeighbors = vec3.create();
			for (var currentNeighbor = 0; currentNeighbor < neighbors.length; currentNeighbor++)
			{
				if (neighbors[currentNeighbor]._vertIndex != theRegularVert._vertIndex)
				{
					vec3.add(weightedNeighbors, weightedNeighbors, neighbors[currentNeighbor]._position);	
				}				
			}
			vec3.scale(weightedNeighbors, weightedNeighbors, NEG_ONE_OVER_TWELVE);

			// Combine weighted contributions:
			vec3.add(newVertPosition, newVertPosition, weightedNeighbors);

			// Current position:
			var scaledCurrentVertex = vec3.create();
			vec3.scale(scaledCurrentVertex, theIrregularVert._position, THREE_OVER_FOUR);
			vec3.add(newVertPosition, newVertPosition, scaledCurrentVertex);
		}
		else if (neighbors.length == 4)	// K = 4:
		{
			// S0:
			vec3.scale(newVertPosition, theRegularVert._position, THREE_OVER_EIGHT);		

			// S2: Find the "center" edge:
			var toExtraordinary = this._edges[theRegularVert._vertIndex][theIrregularVert._vertIndex];

			var weightedNeighbors = vec3.create();
			vec3.scale(weightedNeighbors, this.getInverseEdge(toExtraordinary._edgeLeftCCW)._edgeLeftCCW._vertDest._position, NEG_ONE_OVER_EIGHT);

			// Combine weighted contributions:
			vec3.add(newVertPosition, newVertPosition, weightedNeighbors);

			// Current position:
			var scaledCurrentVertex = vec3.create();
			vec3.scale(scaledCurrentVertex, theIrregularVert._position, THREE_OVER_FOUR);
			vec3.add(newVertPosition, newVertPosition, scaledCurrentVertex);
		}
		else if (neighbors.length >= 5) // K > =5:
		{
			var K = neighbors.length + 1;

			// S0:
			var weight = (1.0 / K) * (ONE_OVER_FOUR + 1.0 + ONE_OVER_TWO );
			var weightedRegularVert = vec3.create();							
			vec3.scale(weightedRegularVert, theRegularVert._position, weight);
			vec3.add(newVertPosition, newVertPosition, weightedRegularVert);
			
			var totalWeights = 0;

			// S1-(K-1)
			for (var currentNeighbor = 0; currentNeighbor < neighbors.length; currentNeighbor++)
			{
				var j = currentNeighbor + 1;

				var weight = (1.0 / K) * (ONE_OVER_FOUR + ( Math.cos( (j * TWO_PI) / K) ) + (ONE_OVER_TWO * Math.cos( (j * FOUR_PI) / K )) );

				totalWeights += weight;

				// Find the correct neighbor:
				var toExtraordinary 		= this._edges[theRegularVert._vertIndex][theIrregularVert._vertIndex];
				var inverseToExtraordinary 	= this.getInverseEdge(toExtraordinary);

				var toNeighbor = this.getInverseEdge(inverseToExtraordinary._edgeLeftCW);
				for(var currentTurn = 0; currentTurn < currentNeighbor; currentTurn++)
				{
					toNeighbor = this.getInverseEdge(toNeighbor._edgeLeftCW);
				}

				var currentWeightedNeighbor = vec3.create();
				vec3.scale(currentWeightedNeighbor, toNeighbor._vertDest._position, weight);

				// Combine weighted contributions:
				vec3.add(newVertPosition, newVertPosition, currentWeightedNeighbor);
			}

			// Current position:
			var scaledCurrentVertex = vec3.create();
			vec3.scale(scaledCurrentVertex, theIrregularVert._position, THREE_OVER_FOUR);
			vec3.add(newVertPosition, newVertPosition, scaledCurrentVertex);
		}

		return newVertPosition;
	}


	// Convert a mesh to OBJ format for download:
	convertMeshToOBJ()
	{
		var objText = "# OBJ output: CMPT 764, Adam Badke\n\n";

		// Construct vertex strings:
		for (var currentVert = 0; currentVert < this._vertices.length; currentVert++)
		{			
			objText += "v " + this.formatFloatValueForOBJOutput(this._vertices[currentVert]._position[0]) + " " + this.formatFloatValueForOBJOutput(this._vertices[currentVert]._position[1]) + " " + this.formatFloatValueForOBJOutput(this._vertices[currentVert]._position[2]) + "\n";
		}

		var uvSection 		= "";
		var normalSection 	= "";
		var faceSection 	= "";

		var hasUVs = this._faces[0]._uvs.length > 0; 	// Assume if the first face has UV's, they all do...
		
		var currentUVIndex 		= 1;	// Start at 1, as OBJ's use 1-based indexing
		var currentNormalIndex 	= 1;

		// Construct face strings:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			// UVs:
			var currentUVString = "";
			var currentUVIndexStrings = [];
			
			if (this._faces[currentFace]._uvs.length > 0)
			{
				for (var currentUV = 0; currentUV < this._faces[currentFace]._uvs.length; currentUV++)
				{
					currentUVString += "vt " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._uvs[currentUV][0]) + " " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._uvs[currentUV][1]) + "\n";
					currentUVIndexStrings.push(currentUVIndex++);
				}
			}
			else if (hasUVs)
			{
				console.log("[mesh::convertMeshToOBJ] Error: Some faces are missing uvs" );
			}
			
			// Normals:
			var currentNormalString = "";
			for (var currentNormal = 0; currentNormal < this._faces[currentFace]._normals.length; currentNormal++)
			{
				currentNormalString += "vn " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._faceNormal[0]) + " " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._faceNormal[1]) + " " + this.formatFloatValueForOBJOutput(this._faces[currentFace]._faceNormal[2]) + "\n";
			}

			var currentFaceString 	= "f ";			
			var startEdge 			= this._faces[currentFace]._edge;
			var currentEdge 		= this._faces[currentFace]._edge;
			var currentVert = 0;
			do
			{
				// Face string:
				currentFaceString += (currentEdge._vertOrigin._vertIndex + 1).toString(); // +1, as OBJ's use 1-based indexing

				currentFaceString += "/";

				// Append UVs:
				if (hasUVs)
				{
					currentFaceString += currentUVIndexStrings[currentVert];
				}
				currentFaceString += "/"

				// Append normals:
				currentFaceString += currentNormalIndex;
				currentNormalIndex++;

				// Append separator/new line:
				if (currentVert == 2)
				{
					currentFaceString += "\n";
				}
				else
				{
					currentFaceString += " ";
				}

				// Prepare for the next iteration:
				currentEdge = currentEdge._edgeLeftCCW;
				currentVert++;
			} while (currentEdge != startEdge)

			// Append results to output:
			faceSection += currentFaceString;
			uvSection += currentUVString;
			normalSection += currentNormalString;
		}

		return objText + uvSection + normalSection + faceSection;
	}


	// Helper function: Converts a value to string, and appends ".0" if it's an integer
	formatFloatValueForOBJOutput(value)
	{
		var result = value.toString();
		if(value % 1 == 0)
		{
			result += ".0";
		}
		return result;
	}

    
    // Initialize vertex buffers:
    initializeBuffers()
    {
		if (this._positionsBuffer != null)
		{
			gl.deleteBuffer(this._positionsBuffer);
			gl.deleteBuffer(this._wireframePositionsBuffer);
			gl.deleteBuffer(this._OBJNormalsBuffer);
			gl.deleteBuffer(this._smoothNormalsBuffer);
			gl.deleteBuffer(this._colorBuffer);
		}

		// (Re)Initialize the buffers we'll upload to WebGL:
		this._positionData 				= [];
		this._OBJNormalsData			= [];
		this._smoothNormalsData	 		= [];
		this._colorData					= [];
		this._wireframePositionsData 	= [];

		// Process each face in the windged-edge structure:
		for (var currentFace = 0; currentFace < this._faces.length; currentFace++)
		{
			var currentEdge = this._faces[currentFace]._edge;

			// Process each vert for the current face:
			for (var currentVert = 0; currentVert < 3; currentVert++)
			{
				// Push the current origin vertex, looping over the x, y, z coords:
				for (var currentElement = 0; currentElement < 3; currentElement++)
				{
					this._positionData.push(currentEdge._vertOrigin._position[currentElement]);

					this._wireframePositionsData.push(currentEdge._vertOrigin._position[currentElement]);

					this._OBJNormalsData.push( this._faces[currentFace]._normals[currentVert][currentElement] );

					this._smoothNormalsData.push(currentEdge._vertOrigin._smoothedNormal[currentElement]);

					// TODO: Handle UVs. For now, just push an arbitrary color
					this._colorData.push(0.75, 0.75, 0.75, 1.0);
				}

				// Also push the destination vertex to the wireframe buffer, as we require 2 points per line when using gl.LINES mode:
				for (var currentElement = 0; currentElement < 3; currentElement++)
				{
					this._wireframePositionsData.push(currentEdge._vertDest._position[currentElement]);
				}

				// Prepare for the next iteration:
				currentEdge = currentEdge._edgeLeftCCW;
			}
		} // end face loop

        // Create and bind an array buffer for vertex positions:
        this._positionsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._positionsBuffer);

        // Buffer the vertex position data:
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(this._positionData),  // Note: We must convert our JS array to a Float32Array
            gl.STATIC_DRAW
        );

		this._wireframePositionsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._wireframePositionsBuffer);

        // Buffer the vertex position data:
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(this._wireframePositionsData),  // Note: We must convert our JS array to a Float32Array
            gl.STATIC_DRAW
        );

        // Create, bind, and buffer OBJ vertex normals:
        this._OBJNormalsBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._OBJNormalsBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(this._OBJNormalsData),  // Note: We must convert our JS array to a Float32Array
            gl.STATIC_DRAW
        );

		// Create, bind, and buffer SMOOTH vertex normals:
		this._smoothNormalsBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this._smoothNormalsBuffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array(this._smoothNormalsData),  // Note: We must convert our JS array to a Float32Array
			gl.STATIC_DRAW
		);

        // Create, bind, and buffer vertex color data:
        this._colorBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array(this._colorData),  // Note: We must convert our JS array to a Float32Array
            gl.STATIC_DRAW
        );

    }


    // Bind a mesh for rendering:
    bindBuffers(gl, bindWireframeVertexBuffers = false)
    {
        // Configure the vertex buffers:
		if (bindWireframeVertexBuffers == true)
		{
			gl.bindBuffer(gl.ARRAY_BUFFER, this._wireframePositionsBuffer);
		}
		else
		{
			gl.bindBuffer(gl.ARRAY_BUFFER, this._positionsBuffer);
		}
        
        gl.vertexAttribPointer(
            gl.getAttribLocation(this._material._shader._shaderProgram, 'in_position'),
            3,          // Number of components: # values per iteration
            gl.FLOAT,   // Type
            false,      // Normalize the data?
            0,          // Stride
            0           // Starting offset
        );
        gl.enableVertexAttribArray(gl.getAttribLocation(this._material._shader._shaderProgram, 'in_position'));

        // Bind the appropriate normal buffer:
		switch(this._shadingMode)
		{
			case SHADING_MODE.SMOOTH:
			case SHADING_MODE.SHADED_WIREFRAME:
			{
				gl.bindBuffer(gl.ARRAY_BUFFER, this._smoothNormalsBuffer);
			}
			break;

			case SHADING_MODE.FLAT:
			case SHADING_MODE.WIREFRAME:
			default:
			{
				gl.bindBuffer(gl.ARRAY_BUFFER, this._OBJNormalsBuffer);
			}
		}

        gl.vertexAttribPointer(
            gl.getAttribLocation(this._material._shader._shaderProgram, 'in_normal'),
            3,          // Number of components: # values per iteration
            gl.FLOAT,   // Type
            false,      // Normalize the data?
            0,          // Stride
            0           // Starting offset
        );
        gl.enableVertexAttribArray(gl.getAttribLocation(this._material._shader._shaderProgram, 'in_normal'));

        // Color buffers:
        gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
        gl.vertexAttribPointer(
            gl.getAttribLocation(this._material._shader._shaderProgram, 'in_vertexColor'),
            4,          // Number of components: # values per iteration
            gl.FLOAT,   // Type
            false,      // Normalize the data?
            0,          // Stride
            0           // Starting offset
        );
        gl.enableVertexAttribArray(gl.getAttribLocation(this._material._shader._shaderProgram, 'in_vertexColor'));

    }
}