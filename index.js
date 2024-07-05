const express = require("express")
const path = require("path")
const ws = require("ws")
const fs = require("fs")
const https = require("https")

const dotenv = require('dotenv')
dotenv.config()

const PORT = 8080

var sections = {
    "0":{},
    "1":{},
    "2":{},
    "3":{},
    "4":{},
    "5":{},
    "6":{},
    "7":{},
    "8":{},
}

var Datastore = require("nedb")

sectionsDB = new Datastore({filename:"sections.db"})

sectionsDB.loadDatabase(err => {
    if (err) {
        console.log(`Failed to load database, error code: ${err}`)
    } else {
        console.log("Loaded Database")
        createAllSections()
    }
})

//Change this at some point
sectionsDB.persistence.setAutocompactionInterval(1000)


function createAllSections() {

    for (let n of Object.keys(sections)) {
        sectionsDB.findOne({section:n}, (err, doc) => {
            if (err) {
                console.log(`Error searching for section ${n}`)
                return
            }
            
            if (doc) {
                console.log(`Found Section ${n}`)

                sections[n].grid = doc.grid
                sections[n].icons = calculateIcon(n)

            } else {
                console.log(`Creating section ${n}`)
                createSection(n, createGrid(10, 10))
            }
        })

    }

}

function createSection(name, grid) {

    sectionsDB.insert({section:name, grid:grid}, (err, doc) => {
        if (err || !doc) {
            console.log("Error Adding Section")
        }
    })

    sections[name] = {grid:grid, updated:false, icons:[null, null, null]}

}

function createGrid(width, height) {

    grid = []
    for (let x = 0; x < width; x++) {
        grid.push([])
        for (let y = 0; y < height; y++) {

            grid[x].push("⬜")

        }
    }

    return grid

}

function saveSection(section) {

    sectionsDB.update({section:section}, {section:section, grid:sections[section].grid}, (err, num) => {
        if (err) {
            console.log(`Error saving secgtion ${section}`)
        } else {
            console.log(`Saved section ${section}`)
        }
    })

}

function changeEmoji(section, x, y, emoji) {

    sections[section].grid[x][y] = emoji
    sections[section].updated = true


    socketServer.clients.forEach(client => {
        if (client.section === section) {
            client.sendData({type:"updateEmoji", section:section, x:x, y:y, emoji:emoji})
        }
    })

}

function calculateIcon(section) {

    let frequencies = {}

    for (let x = 0; x < sections[section].grid.length; x++) {
        for (let y = 0; y < sections[section].grid[x].length; y++) {

            if (frequencies[sections[section].grid[x][y]]) {
                if (sections[section].grid[x][y] === "⬜") {
                    continue
                }
                frequencies[sections[section].grid[x][y]] += 1
            } else {
                frequencies[sections[section].grid[x][y]] = 1
            }


        }
    }

    let highest = [null, null, null]

    if (Object.keys(frequencies).length <= 1) {
        highest = [Object.keys(frequencies)[0],Object.keys(frequencies)[0], Object.keys(frequencies)[0]]
    } else {

        for (let key of Object.keys(frequencies)) {

            for (let h = 0; h < highest.length; h++) {
                if (!highest[h] && !highest.includes(key)) {
                    highest[h] = key
                    continue
                } else if (frequencies[key] > frequencies[highest[h]]) {
                    highest[h] = key
                    continue
                }
            }

        }
    }

    return highest

}



var privateKey = fs.readFileSync(process.env.PRIVATE_KEY)
var certificate = fs.readFileSync(process.env.CERTIFICATE)

var options = {
    key:privateKey,
    cert:certificate,
}

var app = express()

var httpsServer = https.createServer(options, app).listen(PORT, () => {
    console.log(`Server Listening On Port ${PORT}`)
})

app.use("/", express.static(path.join(__dirname, "public"), {extensions:["html"]}))

app.get("/*", (req, res) => {
    res.sendFile(path.join(__dirname, "public/index.html"))
})

var socketServer = new ws.Server({server:httpsServer})

socketServer.broadcast = (data) => {
    socketServer.clients.forEach(client => client.send(JSON.stringify(data)))
}

socketServer.on("connection", (client) => {

    client.sendData = (data) => {client.send(JSON.stringify(data))}

    client.on("message", (raw) => { 

        try {

            let data = JSON.parse(raw)

            switch(data.type) {

                case "change":
                    changeEmoji(data.section, data.x, data.y, data.emoji)
                break;

                case "section":
                    client.sendData({type:"section", section:sections[data.section].grid})
                    client.section = data.section
                break;

                case "allSections":

                    let allSections = {}

                    for (let section of Object.keys(sections)) {
                        allSections[section] = {icons:sections[section].icons}
                    }

                    client.sendData({type:"allSections", sections:allSections})

                break;

            }

        } catch {
            console.log("Invalid Data")
        }


    })
})

setInterval(() => {

    for (let section of Object.keys(sections)) {
        if (sections[section].updated) {
            saveSection(section)

            let icons = calculateIcon(section)
            console.log(icons)
            sections[section].icons = icons

            sections[section].updated = false

        }
    }


}, 5000)
