package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
)

func main() {
	// Parse command line flags
	port := flag.String("port", "8080", "Port to listen on")
	flag.Parse()

	// Define a simple handler for the root path
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello from Go!")
	})

	// Define a handler for the /test endpoint
	http.HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "This is the /test endpoint from Go!")
	})

	// Start the server
	addr := ":" + *port
	log.Printf("Server started on port %s", *port)
	log.Fatal(http.ListenAndServe(addr, nil))
}
