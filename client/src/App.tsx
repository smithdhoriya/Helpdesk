import { useEffect, useState } from "react"

function App() {
  const [message, setMessage] = useState("Loading...")

  useEffect(() => {
    fetch("http://localhost:4000/api/health")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage("Failed to reach server"))
  }, [])

  return (
    <>
      <h1>Helpdesk</h1>
      <p>{message}</p>
    </>
  )
}

export default App
