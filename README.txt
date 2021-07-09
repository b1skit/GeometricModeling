Geometric Modeling
by Adam Badke
adambadke@gmail.com

This code was developed and tested using the Chrome browser with Windows 10. It also has been verified to work with the Windows Edge browser.

The following resources were consulted during the creation of this project:
- WebGL tutorial:
	- https://developer.mozilla.org/en-us/docs/web/api/webgl_api/tutorial/getting_started_with_webgl
- Winged edge reference material:
	- https://en.wikipedia.org/wiki/winged_edge#:~:text=in%20computer%20graphics%2c%20the%20winged,edge%20records%2c%20and%20face%20records.
	- https://people.cs.clemson.edu/~dhouse/courses/405/papers/winged-edge.pdf
	- https://pages.mtu.edu/~shene/courses/cs3621/notes/model/winged-e.html	
 - Edge decimation papers:
		http://mgarland.org/files/papers/quadrics.pdf
		http://www.graphics.rwth-aachen.de/media/papers/mcd_vmv021.pdf




A note on the number of edges collapsed per iteration:
------------------------------------------------------
The total number of edges in the mesh is reduced by a minimum of 3 for each iteration of edge removal the user requests. Thus, collapsing 1 edge will reduce the edges in the mesh by a minimum of 3. The total number of edges removed may be greater than 3 due to degenerate cases:

For example, if an edge e is selected for collapse, and it is flanked by a face f defined with a degree 3 vertex v not part of the selected edge e, to avoid degenerate faces after e has been collapsed, the edge terminating at v that is not part of f will also be collapsed prior to the collapse of e. Thus, in this case the total number of edges removed will be greater than 3.

This strategy avoids any bias in the random edge selection, but may result in the number of edges removed not matching the input precisely.

Additionally, to maintain a closed triangle mesh, this program will not collapse edges once there are 6 remaining edges in the mesh. This is implemented via both a UI check, and checks within the decimation code that will terminate edge collapse once the number of edges is reduced to 6.


A note on mesh sizes:
---------------------
Unfortunately, I noticed the Arm hand model (25,000 verts - https://www.cs.sfu.ca/~haoz/teaching/cmpt464/assign/a2/OBJ_files/armhand.obj) causes occasional freezes/out-of-memory crashes on my browser/PC. If you encounter this, please choose a lower number of edges to decimate in a single pass, or test with a mesh with less vertices/a smaller memory footprint.

I have done significant testing, and I believe this is an issue with the browser and my data structures, not a bug in the logic of my code. All of the other meshes provided in assignment 1 and 2 work perfectly. Additionally, subdivided meshes can also be decimated. The issue is due to my use of a 2D table to store edges. This table becomes very large for meshes with a large number of vertices.

Had I realized this would be a problem, I would have chosen a different data structure (such as a hash map) to store edges.


TODO:
-----
- BUG: Seems that subdividing, decimating, subdivding, and decimating again causes the mesh to collapse in on itself
	-> Check before submitting my current changes... Did I introduce this?
	-> Suspect I'm forgetting to initialize quadrics (or incorrectly reinitializing them?)

- BUG: Exponential runtime causes crashes on large meshes
	-> Switch to using a hash map instead of a 2D table
		-> Start by replacing all table accesses with a function
