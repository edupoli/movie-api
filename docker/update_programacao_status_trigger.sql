CREATE OR REPLACE FUNCTION update_programacao_status()
RETURNS TRIGGER AS $$
DECLARE
    v_current_date DATE := CURRENT_DATE;
    v_schedule_exists BOOLEAN;
BEGIN
    -- Se a semana_fim já passou (no passado em relação à data atual)
    IF NEW.semana_fim < v_current_date THEN
        NEW.status := 'inativo';
    
    -- Se estamos dentro do período de exibição
    ELSIF v_current_date BETWEEN NEW.semana_inicio AND NEW.semana_fim THEN
        NEW.status := 'em cartaz';
    
    -- Se a semana_inicio ainda está no futuro (filme é lançamento futuro)
    ELSIF NEW.semana_inicio > v_current_date THEN
        -- Verifica se existe pelo menos um horário definido em qualquer dia
        SELECT COALESCE(NEW.segunda, NEW.terca, NEW.quarta, NEW.quinta,
                       NEW.sexta, NEW.sabado, NEW.domingo) IS NOT NULL
        INTO v_schedule_exists;
        
        IF v_schedule_exists THEN
            NEW.status := 'pre venda';
        ELSE
            NEW.status := 'em breve';
        END IF;
    
    -- Caso residual (não deveria acontecer com a lógica atual)
    ELSE
        NEW.status := 'em cartaz'; -- Assume como em cartaz por segurança
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recria o trigger (caso já exista)
DROP TRIGGER IF EXISTS trigger_update_programacao_status ON programacao;

CREATE TRIGGER trigger_update_programacao_status
BEFORE INSERT OR UPDATE
ON programacao
FOR EACH ROW
EXECUTE FUNCTION update_programacao_status();