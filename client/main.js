var socket
socket = io.connect()

canvas_width = window.innerWidth * window.devicePixelRatio
canvas_height = window.innerHeight * window.devicePixelRatio

game = new Phaser.Game(canvas_width, canvas_height, Phaser.CANVAS, 'gameDiv')

var enemies = []

var gameProperties = {
  //this is the actual game size to determine the boundary of the world
  gameWidth: 4000,
  gameHeight: 4000,
  game_element: 'gameDiv',
  in_game: false,
}

var main = function(game) {}

function onSocketConnected() {
  console.log('connected to server')

  gameProperties.in_game = true
  socket.emit('new_player', {x: 0, y: 0, angle: 0})
}

// When the server notifies us of client disconnection, we find the disconnected
// enemy and remove from our game
function onRemovePlayer(data) {
  var removePlayer = findPlayerById(data.id)
  // player not found
  if (!removePlayer) {
    console.log('Player not found: ', data.id)
    return
  }

  removePlayer.player.destroy()
  enemies.splice(enemies.indexOf(removePlayer), 1)
}

function createPlayer(data) {
  console.log('creating player...')
  // use phaser's graphics to draw a circle
  player = game.add.graphics(0, 0)
  player.radius = data.size
  // fill and style
  player.beginFill(0xffd900)
  player.lineStyle(2, 0xffd900, 1)
  player.drawCircle(0, 0, player.radius * 2)
  player.endFill()
  player.anchor.setTo(0.5, 0.5)
  player.body_size = player.radius
  // set initial size
  player.initial_size = player.radius
  player.type = 'player_body'
  // draw a shape
  game.physics.p2.enableBody(player, true)
  player.body.clearShapes()
  player.body.addCircle(player.body_size, 0, 0)
  player.body.data.shapes[0].sensor = true
  // enable collision and when it makes a contact with another body, call player_coll
  player.body.onBeginContact.add(player_coll, this)

  console.log('New player: ', player)

//  ypeError: Cannot read property 'FOLLOW_LOCKON' of undefined
  //    at r.createPlayer (main.js:64)

  game.camera.follow(player, Phaser.Camera.FOLLOW_LOCKON, 0.5, 0.5)
}

function getRndInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// this is the enemy class
var remote_player = function(id, startx, starty, startSize, start_angle) {
  this.x = startx
  this.y = starty
	//this is the unique socket id. We use it as a unique name for enemy
  this.id = id
  this.angle = start_angle

  this.player = game.add.graphics(this.x, this.y)
  this.player.radius = startSize

  // set a fill and line style
	this.player.beginFill(0xffd900)
	this.player.lineStyle(2, 0xffd900, 1)
	this.player.drawCircle(0, 0, this.player.radius * 2)
	this.player.endFill()
	this.player.anchor.setTo(0.5,0.5)
  this.initial_size = startSize
	this.player.body_size = this.player.radius
  this.player.type = 'player_body'
  this.player.id = this.id

	// draw a shape
	game.physics.p2.enableBody(this.player, true)
	this.player.body.clearShapes()
	this.player.body.addCircle(this.player.body_size, 0 , 0)
	this.player.body.data.shapes[0].sensor = true
}

//Server will tell us when a new enemy player connects to the server.
//We create a new enemy in our game.
function onNewPlayer(data) {
  console.log('New player connected: ', data)

  // enemy object
  var new_enemy = new remote_player(data.id, data.x, data.y, data.size, data.angle)
  enemies.push(new_enemy)
}

// Server tells us there is a new enemy movement. We find the moved enemy
// and sync the enemy movement with the server
function onEnemyMove(data) {
  console.log('moving enemy')

  var movePlayer = findPlayerById(data.id)

  if (!movePlayer) return

  var newPointer = {
    x: data.x,
    y: data.y,
    worldX: data.x,
    worldY: data.y,
  }

  console.log(data)

  if (data.size != movePlayer.player.body_size) {
    movePlayer.player.body_size = data.size
    var new_scale = movePlayer.player.body_size / movePlayer.initial_size
    movePlayer.player.scale.set(new_scale)
    movePlayer.player.body.clearShapes()
    movePlayer.player.body.addCircle(movePlayer.player.body_size, 0, 0)
    movePlayer.player.body.data.shapes[0].sensor = true
  }

  var distance = distanceToPointer(movePlayer.player, newPointer)
  speed = distance / 0.05

  movePlayer.rotation = moveToPointer(movePlayer.player, speed, newPointer)
}

// we're receiving the calculated position from the server and changing the player position
function onInputRecieved(data) {
  //we're forming a new pointer with the new position
	var newPointer = {
    x: data.x,
    y: data.y,
    worldX: data.x,
    worldY: data.y,
  }

  var distance = distanceToPointer(player, newPointer)
  // we're receiving player position every 50ms. We're interpolating
	// between the current position and the new position so that player does jerk.
  speed = distance / 0.05

  // move to the new position
  player.rotation = moveToPointer(player, speed, newPointer)
}

function onGained(data) {
  // get the new body size from server
  player.body_size = data.new_size
  // get new scale
  var new_scale = data.new_size/player.initial_size
  // set scale
  player.scale.set(new_scale)
  // create new circle body with radius of our player size
  player.body.clearShapes()
  player.body.addCircle(player.body_size, 0, 0)
  player.body.data.shapes[0].sensor = true
}

function onKilled(data) {
  player.destroy()
}

function findPlayerById(id) {
  for (var i = 0; i < enemies.length; i++) {
    if (enemies[i].id == id) {
      return enemies[i]
    }
  }
}

main.prototype = {
  preload: function() {
    // disableVisibilityChange does not let the browser sleep if mouse leaves window, used for development
    game.stage.disableVisibilityChange = true
    game.scale.scaleMode = Phaser.ScaleManager.RESIZE
    game.world.setBounds(0, 0, gameProperties.gameWidth, gameProperties.gameHeight, false, false, false, false)
    game.physics.startSystem(Phaser.Physics.P2JS)
    game.physics.p2.setBoundsToWorld(false, false, false, false, false)
    // sets the y gravity to 0. This means players won’t fall down by gravity
		game.physics.p2.gravity.y = 0
    // turn off gravity
    game.physics.p2.applyGravity = false
    game.physics.p2.enableBody(game.physics.p2.walls, false)
    //physics start system
    // game.physics.p2.setImpactEvents(true)
  },
  create: function() {
    game.stage.backgroundColor = 0xE1A193
    console.log('client started')
    socket.on('connect', onSocketConnected)

    socket.on('create_player', createPlayer)
    socket.on('new_enemyPlayer', onNewPlayer)
    socket.on('enemy_move', onEnemyMove)
    socket.on('remove_player', onRemovePlayer)
    socket.on('input_recieved', onInputRecieved)
    socket.on('killed', onKilled)
    socket.on('gained', onGained)
  },
  update: function() {
    // emit player input

    // move player when he/she is in game
    if (gameProperties.in_game) {
      // we're using phaser's mouse pointer to keep track
      // of user's mouse position
      var pointer = game.input.mousePointer

      socket.emit('input_fired', {
        pointer_x: pointer.x,
        pointer_y: pointer.y,
        pointer_worldX: pointer.worldX,
        pointer_worldY: pointer.worldY,
      })
    }
  }
}

// wrap the game states
var gameBootstrapper = {
  init: function(gameContainerElementId) {
    game.state.add('main', main)
    game.state.start('main')
  }
}

gameBootstrapper.init('gameDiv')
