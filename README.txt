CMPT 764 Assignment 2
by Adam Badke
SFU student #301310785
abadke@sfu.ca

The following resources were consulted during the creation of this assignment:
- Assignment 1 demo code
- WebGL tutorial:
	- https://developer.mozilla.org/en-us/docs/web/api/webgl_api/tutorial/getting_started_with_webgl
- Winged edge reference material:
	- https://en.wikipedia.org/wiki/winged_edge#:~:text=in%20computer%20graphics%2c%20the%20winged,edge%20records%2c%20and%20face%20records.
	- https://people.cs.clemson.edu/~dhouse/courses/405/papers/winged-edge.pdf
	- https://pages.mtu.edu/~shene/courses/cs3621/notes/model/winged-e.html	
 - Edge decimation papers:
		http://mgarland.org/files/papers/quadrics.pdf
		http://www.graphics.rwth-aachen.de/media/papers/mcd_vmv021.pdf

All requested features were implemented.

This code was developed and tested using the Chrome browser with Windows 10. It also has been verified to work with the Windows Edge browser.
If you have any issues running this code please contact me!


A note on the number of edges collapsed per iteration:
------------------------------------------------------
The total number of edges in the mesh is reduced by a minimum of 3 for each iteration of edge removal the user requests. However, the total number of edges removed may be greater than 3, due to degenerate cases.

For example, if an edge e is selected for collapse, and it is flanked by a face f with a degree 3 vertex v not part of the selected edge e, to avoid degenerate faces after e has been collapsed, the edge terminating at v that is not part of f will also be collapsed prior to the collapse of e. Thus, in this case the total number of edges removed will be greater than 3.

Additionally, to maintain a closed triangle mesh, this program will not collapse edges once there are 6 remaining edges in the mesh. This is implemented via both a UI check, and checks within the decimation code that will terminate edge collapse once the number of edges is reduced to 6.