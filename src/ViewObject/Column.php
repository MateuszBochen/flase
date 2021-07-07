<?php

namespace App\ViewObject;

/**
 * class Column
 * @package ${NAMESPACE}
 * @author Mateusz Bochen
 */
class Column
{
    private string $name;
    private ?string $defaultValue;
    private ?string $type;
    private bool $isPrimaryKey;
    private bool $isAutoIncrement;
    private bool $isNullable;
    private string $referenceTable;
    private string $referenceColumn;

    /**
     * Column constructor.
     * @param string $name
     * @param string|null $defaultValue
     * @param string|null $type
     * @param bool $isPrimaryKey
     * @param bool $isAutoIncrement
     * @param bool $isNullable
     * @param string $referenceTable
     * @param string $referenceColumn
     */
    public function __construct(string $name, ?string $defaultValue, ?string $type, bool $isPrimaryKey, bool $isAutoIncrement, bool $isNullable, string $referenceTable, string $referenceColumn)
    {
        $this->name = $name;
        $this->defaultValue = $defaultValue;
        $this->type = $type;
        $this->isPrimaryKey = $isPrimaryKey;
        $this->isAutoIncrement = $isAutoIncrement;
        $this->isNullable = $isNullable;
        $this->referenceTable = $referenceTable;
        $this->referenceColumn = $referenceColumn;
    }

    /**
     * @return string
     */
    public function getName(): string
    {
        return $this->name;
    }

    /**
     * @return string|null
     */
    public function getDefaultValue(): ?string
    {
        return $this->defaultValue;
    }

    /**
     * @return string|null
     */
    public function getType(): ?string
    {
        return $this->type;
    }

    /**
     * @return bool
     */
    public function isPrimaryKey(): bool
    {
        return $this->isPrimaryKey;
    }

    /**
     * @return bool
     */
    public function isAutoIncrement(): bool
    {
        return $this->isAutoIncrement;
    }

    /**
     * @return bool
     */
    public function isNullable(): bool
    {
        return $this->isNullable;
    }

    /**
     * @return string
     */
    public function getReferenceTable(): string
    {
        return $this->referenceTable;
    }

    /**
     * @return string
     */
    public function getReferenceColumn(): string
    {
        return $this->referenceColumn;
    }
}
