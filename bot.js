const isDev = process.env.NODE_ENV === 'development'

if (isDev)
  require('dotenv').config()

const { compact } = require('lodash')

const fetch = require('node-fetch')
const { Client } = require('discord.js')
const client = new Client({partials: [
  'MESSAGE',
  'CHANNEL',
  'USER',
  'REACTION',
  'GUILD_MEMBER'
]})

const baseUrl = isDev ? 'http://127.0.0.1:8787' : 'https://api-quest.stellar.buzz'

client.on('raw', async (packet) => {
  try {
    const {t: type, d: data} = packet
    // console.log(packet)

    switch (type) {
      case 'READY':
        const fraudChannel = await client.channels.fetch('775930950034260008', true, true)
        await fraudChannel.messages.fetch({limit: 100}, true, true).then((messages) => messages.map((message) => dealWithMessage(message, fraudChannel)))
      break

      case 'MESSAGE_CREATE':
        if (data.content.indexOf('airdrop') > -1) {
          const channel = await client.channels.fetch(data.channel_id, true, true)
          const message = await channel.messages.fetch(data.id, true, true)

          await message.delete()
        }

        else if (
          data.channel_id === '768682525119610892' // admins-only channel
          && (
            data.content.indexOf('🧠') > -1
            || data.content.indexOf('👍') > -1
            || data.content.indexOf('👎') > -1
          )
        ) {
          const channel = await client.channels.fetch(data.channel_id, true, true)
          const message = await channel.messages.fetch(data.id, true, true)

          const [
            emoji,
            id
          ] = data.content.split(' ')

          let status

          if (emoji === '🧠')
            status = 'pending'

          if (emoji === '👍')
            status = 'yes'

          if (emoji === '👎')
            status = 'no'

          await fetch(`${baseUrl}/user/submit?series=1`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              id,
              token: process.env.GROOT_KEY,
              verified: status
            })
          })

          await message.delete()
        }

        else if (
          data.channel_id === '775930950034260008' // fraud-squad channel
          && data.content.indexOf('🧠') > -1
        ) {
          const channel = await client.channels.fetch(data.channel_id, true, true)
          const message = await channel.messages.fetch(data.id, true, true)

          const [,
            id
          ] = data.content.split(' ')

          await fetch(`${baseUrl}/user/submit?series=1`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              id,
              token: process.env.GROOT_KEY,
              verified: 'pending'
            })
          })

          await message.delete()
        }
      break

      case 'MESSAGE_REACTION_ADD':
        const channel = await client.channels.fetch(data.channel_id, true, true)
        let message = await channel.messages.fetch(data.message_id, true, true)

        if (data.channel_id === '775930950034260008') {
          if (
            !message.author.bot
            || data.emoji.name === '🧠'
          ) return

          else if (
            data.emoji.name !== '👍'
            && data.emoji.name !== '👎'
          ) await message.reactions.cache.get(data.emoji.name).remove()

          else {
            await Promise.all(message.reactions.cache.map((reaction) => {
              if (reaction.emoji.name !== data.emoji.name)
                return reaction.users.remove(data.user_id)
            }))

            message = await message.fetch(true)

            await dealWithMessage(message, channel)
          }
        }

        else if (data.emoji.name === '⚠️') {
          const legitWarnFlags = await message.reactions.cache
          .filter((reaction) => reaction.emoji.name === '⚠️')
          .map(async (reaction) => {
            await reaction.users.fetch()

            const hasPower = await Promise.all(
              reaction.users.cache.map(async (user) => {
                const member = await reaction.message.guild.members.fetch({
                  user,
                  force: true,
                })

                return (
                  member.roles.cache.has('763799716546215977') // Admin
                  || member.roles.cache.has('765215960863997962') // SDF
                  || member.roles.cache.has('766768688342499390') // Lumenaut
                )
              })
            ).then(compact)

            return hasPower.length
          })[0]

          if (legitWarnFlags >= 2)
            await message.delete()
        }
      break

      default:
      return
    }
  }

  catch(err) {
    console.error(err)
  }
})

client.login(process.env.DISCORD_BOT_TOKEN)

async function dealWithMessage(message, channel) {
  if (!message.author.bot)
    return

  const upvotes = message.reactions.cache.filter((reaction) => reaction.emoji.name === '👍').first()
  const downvotes = message.reactions.cache.filter((reaction) => reaction.emoji.name === '👎').first()

  const isDevMessage = message.content.indexOf('quest') === -1

  if (isDevMessage !== isDev)
    return

  const body = {
    id: message.author.username.split('→')[1].trim(),
    token: process.env.GROOT_KEY,
  }

  if (upvotes && upvotes.count >= 1) {
    await fetch(`${baseUrl}/user/submit?series=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...body,
        verified: 'yes'
      })
    })

    await message.delete()
  }

  else if (downvotes && downvotes.count >= 1) {
    await fetch(`${baseUrl}/user/submit?series=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...body,
        verified: 'no'
      })
    })

    await message.delete()
  }
}