CREATE OR REPLACE FUNCTION update_all_programacao_status()
RETURNS VOID AS $$
BEGIN
    -- Atualiza para 'inativo' tudo que já passou da semana_fim
    UPDATE programacao 
    SET status = 'inativo'
    WHERE semana_fim < CURRENT_DATE;
    
    -- Atualiza para 'em cartaz' tudo que está no período de exibição
    UPDATE programacao 
    SET status = 'em cartaz'
    WHERE CURRENT_DATE BETWEEN semana_inicio AND semana_fim;
    
    -- Atualiza para 'pre-venda' os futuros com horários definidos
    UPDATE programacao 
    SET status = 'pre venda'
    WHERE semana_inicio > CURRENT_DATE
    AND (segunda IS NOT NULL OR terca IS NOT NULL OR quarta IS NOT NULL OR
         quinta IS NOT NULL OR sexta IS NOT NULL OR sabado IS NOT NULL OR
         domingo IS NOT NULL);
    
    -- Atualiza para 'em breve' os futuros sem horários definidos
    UPDATE programacao 
    SET status = 'em breve'
    WHERE semana_inicio > CURRENT_DATE
    AND segunda IS NULL AND terca IS NULL AND quarta IS NULL AND
        quinta IS NULL AND sexta IS NULL AND sabado IS NULL AND
        domingo IS NULL;
END;
$$ LANGUAGE plpgsql;