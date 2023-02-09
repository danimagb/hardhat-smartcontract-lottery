const { assert, expect } = require("chai")
const { deployments, ethers, getNamedAccounts, network } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", () => {
          let raffle, raffleContract, vrfCoordinatorV2Mock, raffleEntranceFee, interval, player // deployer

          beforeEach(async function () {
              accounts = await ethers.getSigners() // could also do with getNamedAccounts
              //   deployer = accounts[0]
              player = accounts[1]
              await deployments.fixture(["mocks", "raffle"]) // Deploys modules with the tags "mocks" and "raffle"
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") // Returns a new connection to the VRFCoordinatorV2Mock contract
              raffleContract = await ethers.getContract("Raffle") // Returns a new connection to the Raffle contract
              raffle = raffleContract.connect(player) // Returns a new instance of the Raffle contract connected to player
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
          })

          //Ideally make tests have just 1 assert per "it", I'm just being lazy :)
          describe("constructor", () => {
              it("Initializes the raffle correctly", async function () {
                  const raffleState = await raffle.getRaffleState()
                  const interval = await raffle.getInterval()

                  assert.equal(raffleState.toString(), "0")
                  assert.equal(
                      interval.toString(),
                      networkConfig[network.config.chainId]["interval"]
                  )
              })
          })

          describe("joinRaffle", () => {
              it("Reverts when  you don't pay enough", async function () {
                  await expect(raffle.joinRaffle()).to.be.revertedWith(
                      "Raffle__NotEnoughEthEntered"
                  )
              })

              it("Record players when they join", async function () {
                  await raffle.joinRaffle({ value: raffleEntranceFee })
                  const playerFromContract = await raffle.getPlayer(0)

                  assert.equal(player.address, playerFromContract)
              })

              it("Emits event on join", async function () {
                  await expect(raffle.joinRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  )
              })

              it("Doesn't allow to join when raffle is calculating", async () => {
                  //Arrange
                  await raffle.joinRaffle({ value: raffleEntranceFee })

                  // Increases the time of the blockchain and mines a block. for more information goto // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  // We need this so we can set the RaffleState to 'Calculating'
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  // Pretend to be a ChainLink keeper and call the 'performUpKeep()' which is public
                  await raffle.performUpkeep([]) // With this we set the RaffleState to 'Calculating'

                  // Act & Assert
                  await expect(raffle.joinRaffle({ value: raffleEntranceFee })).to.be.revertedWith(
                      "Raffle__NotOpen"
                  )
              })
          })

          describe("checkUpkeep", () => {
              it("Returns false if no one has joined the raffle", async () => {
                  // Arrange

                  // Increases the time of the blockchain and mines a block. for more information goto // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  // We need this so we can set the RaffleState to 'Calculating'
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  // Act
                  // Using the callStatic to simulate sending the transaction
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])

                  // Assert
                  assert(!upkeepNeeded)
              })

              it("Returns false if raffle isn't open", async () => {
                  // Arrange
                  await raffle.joinRaffle({ value: raffleEntranceFee })

                  // Increases the time of the blockchain and mines a block. for more information goto // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                  // We need this so we can set the RaffleState to 'Calculating'
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  // Pretend to be a ChainLink keeper and call the 'performUpKeep()' which is public
                  await raffle.performUpkeep([]) // With this we set the RaffleState to 'Calculating'
                  const raffleState = await raffle.getRaffleState()
                  // Act
                  // Using the callStatic to simulate sending the transaction
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([])

                  // Assert
                  assert(raffleState.toString(), "1")
                  assert(!upkeepNeeded)
              })

              it("Returns false if enough time hasn't passed", async () => {
                  await raffle.joinRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 10]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)

                  assert(!upkeepNeeded)
              })

              it("Returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.joinRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)

                  assert(upkeepNeeded, true)
              })
          })

          describe("performUpkeep", () => {
              it("Can only run if checkUpkeep is true", async () => {
                  // Arrange
                  await raffle.joinRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffle.performUpkeep([])

                  // Act & Assert
                  assert(tx)
              })

              it("Reverts when checkUpkeep is false", async () => {
                  // Act & Assert
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded"
                  )
              })

              it("Updates raffle state, emits event and calls the vrfCoordinator", async () => {
                  // Arrange
                  await raffle.joinRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })

                  // Act
                  const txResponse = await raffle.performUpkeep([])
                  const txReceipt = await txResponse.wait(1)
                  const requestId = txReceipt.events[1].args.requestId
                  const raffleState = await raffle.getRaffleState()

                  // Assert
                  assert(requestId.toNumber() > 0)
                  assert(raffleState.toString(), "1")
              })
          })

          describe("fulfillRandomWords", () => {
              beforeEach(async () => {
                  await raffle.joinRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })

              it("Can only be called after performUpkeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request")
              })

              // This test is too big...
              // This test simulates users entering the raffle and wraps the entire functionality of the raffle
              // inside a promise that will resolve if everything is successful.
              // An event listener for the WinnerPicked is set up
              // Mocks of chainlink keepers and vrf coordinator are used to kickoff this winnerPicked event
              // All the assertions are done once the WinnerPicked event is fired
              it("picks a winner, resets, and sends money", async () => {
                  const additionalEntrances = 3 // to test
                  const startingIndex = 2
                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                      // i = 2; i < 5; i=i+1
                      raffle = raffleContract.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                      await raffle.joinRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp() // stores starting timestamp (before we fire our event)

                  // This will be more important for our staging tests...
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          // event listener for WinnerPicked
                          console.log("WinnerPicked event fired!")
                          // assert throws an error if it fails, so we need to wrap
                          // it in a try/catch so that the promise returns event
                          // if it fails.
                          try {
                              // Now lets get the ending values...
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await accounts[2].getBalance()
                              const endingTimeStamp = await raffle.getLatestTimeStamp()
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              // Comparisons to check if our ending values are correct:
                              assert.equal(recentWinner.toString(), accounts[2].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrances)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve() // if try passes, resolves the promise
                          } catch (e) {
                              reject(e) // if try fails, rejects the promise
                          }
                      })

                      // kicking off the event by mocking the chainlink keepers and vrf coordinator
                      const tx = await raffle.performUpkeep("0x")
                      const txReceipt = await tx.wait(1)
                      const startingBalance = await accounts[2].getBalance()
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
