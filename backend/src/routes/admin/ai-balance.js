export function estimateCost(modelName, tokenUsage) {
  if (!tokenUsage) return 0
  const input = Number(tokenUsage.input_tokens || 0)
  const output = Number(tokenUsage.output_tokens || 0)
  
  const m = String(modelName || '').toLowerCase()
  let inputRate = 3.00 // default Sonnet 3.5
  let outputRate = 15.00
  
  if (m.includes('opus')) {
    inputRate = 15.00
    outputRate = 75.00
  } else if (m.includes('haiku')) {
    if (m.includes('3-5') || m.includes('3.5')) {
      inputRate = 0.80
      outputRate = 4.00
    } else {
      inputRate = 0.25
      outputRate = 1.25
    }
  } else if (m.includes('sonnet')) {
    inputRate = 3.00
    outputRate = 15.00
  }
  
  return ((input * inputRate) + (output * outputRate)) / 1_000_000
}

export default async function aiBalanceRoutes(fastify) {
  const adminRead = fastify.rbac('admin', 'read', { allowExtra: false })
  
  fastify.get('/ai-balance', {
    preHandler: [fastify.authenticate, adminRead]
  }, async (request) => {
    const { startDate, endDate, userEmail, limit = 50, offset = 0 } = request.query
    
    // Build filter
    const where = {}
    
    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    } else {
      // Default to last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      where.createdAt = { gte: thirtyDaysAgo }
    }
    
    if (userEmail) {
      where.userEmail = { contains: userEmail, mode: 'insensitive' }
    }
    
    // Fetch records for statistics (lightweight columns)
    const statsRows = await fastify.prisma.aiQueryLog.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        userEmail: true,
        userNombre: true,
        model: true,
        tokenUsage: true,
        latencyMs: true,
        status: true,
        usedTools: true,
      },
      orderBy: { createdAt: 'asc' }
    })
    
    // Aggregate metrics
    let totalQueries = statsRows.length
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCost = 0
    let totalLatency = 0
    let successCount = 0
    let errorCount = 0
    
    const byDayMap = {}
    const byUserMap = {}
    const byToolMap = {}
    const byModelMap = {}
    
    for (const row of statsRows) {
      const input = Number(row.tokenUsage?.input_tokens || 0)
      const output = Number(row.tokenUsage?.output_tokens || 0)
      
      totalInputTokens += input
      totalOutputTokens += output
      
      const cost = estimateCost(row.model, row.tokenUsage)
      totalCost += cost
      
      totalLatency += row.latencyMs || 0
      
      if (row.status === 'ok') {
        successCount++
      } else {
        errorCount++
      }
      
      // Group by Day (using Chile timezone for local date grouping)
      let dayStr
      try {
        dayStr = new Date(row.createdAt).toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' }).slice(0, 10)
      } catch (e) {
        dayStr = new Date(row.createdAt).toISOString().slice(0, 10)
      }
      
      if (!byDayMap[dayStr]) {
        byDayMap[dayStr] = { date: dayStr, queries: 0, cost: 0, tokens: 0 }
      }
      byDayMap[dayStr].queries++
      byDayMap[dayStr].cost += cost
      byDayMap[dayStr].tokens += (input + output)
      
      // Group by User
      const email = row.userEmail || 'sistema@plastimar.cl'
      const nombre = row.userNombre || 'Sistema'
      if (!byUserMap[email]) {
        byUserMap[email] = { email, nombre, queries: 0, cost: 0, tokens: 0 }
      }
      byUserMap[email].queries++
      byUserMap[email].cost += cost
      byUserMap[email].tokens += (input + output)
      
      // Group by Model
      const modelName = row.model || 'Desconocido'
      if (!byModelMap[modelName]) {
        byModelMap[modelName] = { model: modelName, queries: 0, cost: 0 }
      }
      byModelMap[modelName].queries++
      byModelMap[modelName].cost += cost
      
      // Group by Tool
      const tools = Array.isArray(row.usedTools) ? row.usedTools : []
      for (const t of tools) {
        byToolMap[t] = (byToolMap[t] || 0) + 1
      }
    }
    
    const avgLatency = totalQueries > 0 ? Math.round(totalLatency / totalQueries) : 0
    const successRate = totalQueries > 0 ? (successCount / totalQueries) * 100 : 100
    
    // Sort aggregate results
    const byDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date))
    const byUser = Object.values(byUserMap).sort((a, b) => b.cost - a.cost)
    const byModel = Object.values(byModelMap).sort((a, b) => b.cost - a.cost)
    const byTool = Object.entries(byToolMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      
    // Fetch paginated recent logs (including full question & answerPreview)
    const take = Math.min(Number(limit) || 50, 200)
    const skip = Number(offset) || 0
    
    const recentLogs = await fastify.prisma.aiQueryLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
    
    const totalLogs = await fastify.prisma.aiQueryLog.count({ where })
    
    // Map cost to each log dynamically
    const items = recentLogs.map(log => ({
      ...log,
      estimatedCost: estimateCost(log.model, log.tokenUsage)
    }))
    
    return {
      summary: {
        totalQueries,
        totalTokens: totalInputTokens + totalOutputTokens,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalCost,
        avgLatency,
        successCount,
        errorCount,
        successRate,
      },
      charts: {
        byDay,
        byUser,
        byModel,
        byTool,
      },
      logs: {
        items,
        total: totalLogs,
        limit: take,
        offset: skip,
      }
    }
  })
}
